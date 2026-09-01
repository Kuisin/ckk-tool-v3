import "server-only";

/**
 * ディスプレイに映す画像の保存（SY09「ディスプレイ」）。
 *
 * **Server Action ではなく Route Handler（POST /api/displays/[id]/image）から
 * 呼ぶ**こと。Server Action のリクエストボディは既定 1MB 上限で、掲示に使う
 * ような画像は自分のコードに届く前に 413 で落ちる — プロフィール写真・添付・
 * フロアマップ図面と同じ理由・同じ方式に揃えている。
 *
 * 保存先は SeaweedFS `display/images/{系統的リネーム}` + files 行
 * （lib/floor-map-image.ts と同じ保存フロー）。差し替え時の旧画像は
 * best-effort で削除する。
 *
 * ★ **画像を保存した時点で、その画面の表示内容は IMAGE になる。** 「画像を
 *   上げる」と「それを映す」を別操作にすると、上げただけで何も変わらない
 *   状態が作れてしまい、現場からは「反映されない」としか見えない。
 */

import { getTranslations } from "next-intl/server";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { IMAGE_FITS } from "@/lib/display-content";
import { notifyDisplayConfigChanged } from "@/lib/display-events";
import { systematicFileName } from "@/lib/file-naming";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject, putObject } from "@/lib/storage";

/** 掲示画像の最大サイズ（10MB）。フロアマップ図面と同じ上限。 */
export const MAX_DISPLAY_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * 拡張子 → 許可する MIME。**拡張子と中身の型が食い違うものは受け付けない**
 * （フロアマップと同じ規約）。SVG を許すのはフロアマップと同じ判断で、
 * 上げられるのは kiosk 権限を持つ社内の管理者だけ。
 */
const IMAGE_TYPES: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  svg: ["image/svg+xml"],
};

/** 画像を差し替え、その画面を IMAGE 表示にする。 */
export async function saveDisplayImage(
  displayId: string,
  file: File,
): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const tr = await getTranslations();

  if (file.size <= 0) return actionError(tr("common.selectAnImageFile"));
  if (file.size > MAX_DISPLAY_IMAGE_BYTES) {
    return actionError(tr("common.imageSizeMax10Mb"));
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const allowed = IMAGE_TYPES[ext];
  if (!allowed || !allowed.includes(file.type.toLowerCase())) {
    return actionError(
      tr("common.unsupportedImageFormat", {
        formats: "PNG / JPG / WEBP / GIF / SVG",
      }),
    );
  }

  try {
    const display = await prisma.displayDevice.findUnique({
      where: { id: displayId },
      select: { contentType: true, contentConfig: true, status: true },
    });
    if (!display)
      return actionError(tr("settings.displaysActions.displayNotFound"));
    if (display.status === "REVOKED") {
      return actionError(tr("settings.displaysActions.revokedCannotOperate"));
    }

    // 差し替え前に映していた画像（あれば）。新しい行を作ってから消す。
    const previous = display.contentConfig as {
      fileId?: unknown;
      fit?: unknown;
    } | null;
    const previousFileId =
      display.contentType === "IMAGE" ? (previous?.fileId ?? null) : null;
    // **収め方は引き継ぐ。** 画像を差し替えるたびに contain へ戻ると、
    // 合わせ込んだ設定が黙って消える。
    const fit =
      display.contentType === "IMAGE" &&
      typeof previous?.fit === "string" &&
      (IMAGE_FITS as readonly string[]).includes(previous.fit)
        ? (previous.fit as (typeof IMAGE_FITS)[number])
        : "contain";

    const bytes = await file.arrayBuffer();
    const storageKey = `display/images/${systematicFileName(file.name)}`;
    if (!(await putObject(storageKey, bytes, allowed[0]))) {
      return actionError(tr("common.storageSaveFailed"));
    }

    const actor = await getCurrentActorId();
    let createdId: string;
    try {
      createdId = await prisma.$transaction(async (tx) => {
        const created = await tx.file.create({
          data: {
            storageKey,
            filename: file.name,
            mimeType: allowed[0],
            sizeBytes: BigInt(bytes.byteLength),
            uploadedBy: actor,
          },
          select: { id: true },
        });
        await tx.displayDevice.update({
          where: { id: displayId },
          data: {
            contentType: "IMAGE",
            contentConfig: { fileId: created.id, fit },
          },
        });
        return created.id;
      });
    } catch (e) {
      await deleteObject(storageKey); // DB 失敗時は孤児を掃除
      throw e;
    }

    // 旧画像は best-effort で削除（他参照が残る場合は温存）。
    if (typeof previousFileId === "string" && previousFileId !== createdId) {
      const old = await prisma.file.findUnique({
        where: { id: previousFileId },
        select: { storageKey: true },
      });
      if (old) {
        const deleted = await prisma.file
          .delete({ where: { id: previousFileId } })
          .then(() => true)
          .catch(() => false);
        if (deleted) await deleteObject(old.storageKey);
      }
    }

    await recordAudit({
      action: "UPDATE",
      tableName: "display_devices",
      recordId: displayId,
      before: { contentType: display.contentType },
      after: { contentType: "IMAGE", image: file.name, fit },
    });
    // 壁の画面をその場で切り替える（待たせない）
    await notifyDisplayConfigChanged(displayId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.imageSaveFailed"), tr));
  }
}
