import "server-only";

/**
 * inspection-template-image.ts — 検査表テンプレートの参考画像
 * （inspection_templates.image_file_id）の読み書き。server-only.
 *
 * 測定位置の図解・現物写真など、テンプレート 1 件につき 1 枚。設定すると
 * PDF（空欄シート・記入済みシートの両方）にも印刷される
 * （lib/inspection-sheet-pdf.ts templateImageHtml）。
 *
 * アバター（lib/avatar.ts）と同じ保存フロー（SeaweedFS + files 行）だが、
 * 正方形・サムネイルは要らない（図解・写真をそのまま 1 枚印刷するだけ）。
 */

import { getTranslations } from "next-intl/server";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { systematicFileName } from "@/lib/file-naming";
import { imageSize } from "@/lib/image-size";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject, getObject, putObject } from "@/lib/storage";

/** 最大ファイルサイズ（5MB。アバターと同じ上限）。 */
export const MAX_TEMPLATE_IMAGE_BYTES = 5 * 1024 * 1024;

/** 保存を許す 1 辺の上限 px（アバターより緩め — 図解・写真は正方形ではない）。 */
export const MAX_TEMPLATE_IMAGE_PIXELS = 4000;

/** 許可する拡張子 → 許可する申告 MIME（SVG は不可 — インライン配信のため）。 */
const IMAGE_TYPES: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
};

export const TEMPLATE_IMAGE_EXT_LABEL = "PNG / JPG / WEBP";

/**
 * 画像 1 枚を検証する — 形式（拡張子 × 申告 MIME）・容量・寸法上限。
 * 文字列を返したらエラー理由。
 */
async function checkImage(
  file: File,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<
  { bytes: ArrayBuffer; contentType: string; filename: string } | string
> {
  if (file.size <= 0) return tr("common.selectAnImageFile");
  if (file.size > MAX_TEMPLATE_IMAGE_BYTES) {
    return tr("common.imageSizeMax5Mb");
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const allowed = IMAGE_TYPES[ext];
  if (!allowed || !allowed.includes(file.type.toLowerCase())) {
    return tr("common.unsupportedImageFormat", {
      formats: TEMPLATE_IMAGE_EXT_LABEL,
    });
  }
  const bytes = await file.arrayBuffer();
  const size = imageSize(bytes);
  if (!size) return tr("common.couldNotReadAsImage");
  if (
    size.width > MAX_TEMPLATE_IMAGE_PIXELS ||
    size.height > MAX_TEMPLATE_IMAGE_PIXELS
  ) {
    return tr("common.imageMustBeAtMostPixelsSquareNoLabel", {
      maxPixels: MAX_TEMPLATE_IMAGE_PIXELS,
    });
  }
  return { bytes, contentType: allowed[0], filename: file.name };
}

/**
 * 画像の files 行 + 実体を掃除（存在しなくても何もしない）。テンプレート側の
 * image_file_id はもう外れている（差し替え時）か、テンプレート自体が消えた
 * 後（削除時）のどちらかで呼ぶ — deleteInspectionTemplates からも使う。
 */
export async function discardTemplateImageFile(
  fileId: string | null,
): Promise<void> {
  if (!fileId) return;
  const before = await prisma.file
    .findUnique({ where: { id: fileId }, select: { storageKey: true } })
    .catch(() => null);
  const deleted = await prisma.file
    .delete({ where: { id: fileId } })
    .then(() => true)
    .catch(() => false);
  if (deleted && before) await deleteObject(before.storageKey);
}

/**
 * 参考画像を data URI として読む（PDF 埋め込み用）。Gotenberg は同梱ファイル
 * しか読めないため、レコードごとに違う実体（SeaweedFS）はテンプレート内で
 * ファイル参照できず、生成のたびにここで data URI へ変換して埋め込む。
 * 未設定・読めない場合は null。
 */
export async function templateImageDataUri(
  imageFileId: string | null,
): Promise<{ dataUri: string; filename: string } | null> {
  if (!imageFileId) return null;
  const file = await prisma.file.findUnique({
    where: { id: imageFileId },
    select: { storageKey: true, filename: true, mimeType: true },
  });
  if (!file) return null;
  const bytes = await getObject(file.storageKey);
  if (!bytes) return null;
  const base64 = Buffer.from(bytes).toString("base64");
  return {
    dataUri: `data:${file.mimeType};base64,${base64}`,
    filename: file.filename,
  };
}

/** 参考画像を設定・差し替える。呼び出し側で権限確認済みであること。 */
export async function saveInspectionTemplateImage(
  templateId: number,
  file: File,
  uploadedBy: string | null,
): Promise<ActionResult<{ fileId: string }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const tr = await getTranslations();

  const checked = await checkImage(file, tr);
  if (typeof checked === "string") return actionError(checked);

  try {
    const before = await prisma.inspectionTemplate.findUnique({
      where: { id: templateId },
      select: { code: true, imageFileId: true },
    });
    if (!before)
      return actionError(
        tr("master.inspectionTemplateActions.targetTemplateNotFound"),
      );

    const storageKey = `inspection-templates/${templateId}/${systematicFileName(
      checked.filename,
    )}`;
    if (!(await putObject(storageKey, checked.bytes, checked.contentType))) {
      return actionError(tr("common.storageSaveFailed"));
    }

    let fileId: string;
    try {
      fileId = await prisma.$transaction(async (tx) => {
        const created = await tx.file.create({
          data: {
            storageKey,
            filename: checked.filename,
            mimeType: checked.contentType,
            sizeBytes: BigInt(checked.bytes.byteLength),
            uploadedBy,
          },
          select: { id: true },
        });
        await tx.inspectionTemplate.update({
          where: { id: templateId },
          data: { imageFileId: created.id },
        });
        return created.id;
      });
    } catch (e) {
      await deleteObject(storageKey);
      throw e;
    }

    await discardTemplateImageFile(before.imageFileId);
    await recordAudit({
      action: "UPDATE",
      tableName: "inspection_templates",
      recordId: String(templateId),
      after: {
        note: tr("common.referenceImageSetNote", { name: checked.filename }),
      },
    });
    return actionOk({ fileId });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.imageSaveFailed"), tr));
  }
}

/** 参考画像を削除する。呼び出し側で権限確認済みであること。 */
export async function removeInspectionTemplateImage(
  templateId: number,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const tr = await getTranslations();
  try {
    const before = await prisma.inspectionTemplate.findUnique({
      where: { id: templateId },
      select: { imageFileId: true },
    });
    if (!before)
      return actionError(
        tr("master.inspectionTemplateActions.targetTemplateNotFound"),
      );
    if (!before.imageFileId) return actionOk();

    await prisma.inspectionTemplate.update({
      where: { id: templateId },
      data: { imageFileId: null },
    });
    await discardTemplateImageFile(before.imageFileId);
    await recordAudit({
      action: "UPDATE",
      tableName: "inspection_templates",
      recordId: String(templateId),
      after: { note: tr("common.referenceImageDeletedNote") },
    });
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.imageDeleteFailed"), tr),
    );
  }
}
