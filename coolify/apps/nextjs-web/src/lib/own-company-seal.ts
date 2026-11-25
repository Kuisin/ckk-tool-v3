import "server-only";

/**
 * 自社法人の画像 — 社印（電子印影）とロゴ — の保存・削除（MS0I）。
 *
 * **Server Action ではなく Route Handler（/api/master/own-companies/[id]/seal・
 * /logo）から呼ぶ** — 画像は Server Action の既定ボディ上限（1MB）に掛かり得る
 * ため、フロアマップ・プロフィール写真と同じ方式に揃えている。
 *
 * 2 種類は置き場所と列が違うだけで、検証・保存・差し替え・監査は同じ手順を通る
 * （片方だけ直して食い違わないように 1 本にしてある）。
 *
 * 保存先は SeaweedFS `own-companies/{seals|logos}/{系統的リネーム}` + files 行。
 * 旧画像は best-effort で削除する。SVG は受け付けない（中に <script> を書ける
 * — 監査 M1。PDF にはラスタで十分）。
 */

import { getTranslations } from "next-intl/server";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { systematicFileName } from "@/lib/file-naming";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject, putObject } from "@/lib/storage";

/** 画像の種類。 */
export type OwnCompanyImageKind = "seal" | "logo";

/** 画像の最大サイズ（2MB）。印影もロゴも小さな画像で足りる。 */
export const MAX_OWN_COMPANY_IMAGE_BYTES = 2 * 1024 * 1024;
/** @deprecated {@link MAX_OWN_COMPANY_IMAGE_BYTES} と同じ値。 */
export const MAX_SEAL_BYTES = MAX_OWN_COMPANY_IMAGE_BYTES;

/** 種類ごとの違い（置き場所・メッセージ・監査の鍵）。 */
export const OWN_COMPANY_IMAGE = {
  seal: {
    folder: "own-companies/seals",
    tooLarge: "master.ownCompanies.sealTooLarge",
    saveFailed: "master.ownCompanies.sealSaveFailed",
  },
  logo: {
    folder: "own-companies/logos",
    tooLarge: "master.ownCompanies.logoTooLarge",
    saveFailed: "master.ownCompanies.logoSaveFailed",
  },
} as const;

/** 拡張子 → 許可する MIME。拡張子と中身の型が食い違うものは受け付けない。 */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** 旧画像を片付ける（他から参照されていれば温存）。 */
async function dropFile(file: { id: string; storageKey: string } | null) {
  if (!file) return;
  const removed = await prisma.file
    .delete({ where: { id: file.id } })
    .then(() => true)
    .catch(() => false);
  if (removed) await deleteObject(file.storageKey);
}

const FILE_REF = { select: { id: true, storageKey: true } } as const;

/** いま付いている画像（種類ぶん）。法人が無ければ undefined。 */
async function currentImage(companyId: number, kind: OwnCompanyImageKind) {
  const company = await prisma.ownCompany.findUnique({
    where: { id: companyId },
    select: { sealFile: FILE_REF, logoFile: FILE_REF },
  });
  if (!company) return undefined;
  return kind === "seal" ? company.sealFile : company.logoFile;
}

function columnData(kind: OwnCompanyImageKind, fileId: string | null) {
  return kind === "seal" ? { sealFileId: fileId } : { logoFileId: fileId };
}

/** 画像を差し替える。RBAC・検証・保存・監査までを一貫して行う。 */
export async function saveOwnCompanyImage(
  kind: OwnCompanyImageKind,
  companyId: number,
  file: File,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const tr = await getTranslations();
  const spec = OWN_COMPANY_IMAGE[kind];

  if (file.size <= 0) return actionError(tr("common.selectAnImageFile"));
  if (file.size > MAX_OWN_COMPANY_IMAGE_BYTES) {
    return actionError(tr(spec.tooLarge));
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const mime = IMAGE_TYPES[ext];
  if (!mime || mime !== file.type.toLowerCase()) {
    return actionError(
      tr("common.unsupportedImageFormat", { formats: "PNG / JPG" }),
    );
  }

  try {
    const previous = await currentImage(companyId, kind);
    if (previous === undefined) {
      return actionError(tr("master.ownCompanies.notFound"));
    }

    const bytes = await file.arrayBuffer();
    const storageKey = `${spec.folder}/${systematicFileName(file.name)}`;
    if (!(await putObject(storageKey, bytes, mime))) {
      return actionError(tr("common.storageSaveFailed"));
    }

    const actor = await getCurrentActorId();
    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.file.create({
          data: {
            storageKey,
            filename: file.name,
            mimeType: mime,
            sizeBytes: BigInt(bytes.byteLength),
            uploadedBy: actor,
          },
          select: { id: true },
        });
        await tx.ownCompany.update({
          where: { id: companyId },
          data: columnData(kind, created.id),
        });
      });
    } catch (e) {
      await deleteObject(storageKey); // DB 失敗時は孤児を掃除
      throw e;
    }

    await dropFile(previous);
    await recordAudit({
      action: "UPDATE",
      tableName: "own_companies",
      recordId: String(companyId),
      after: { [kind]: file.name },
    });
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr(spec.saveFailed), tr));
  }
}

/** 画像を外す。 */
export async function removeOwnCompanyImage(
  kind: OwnCompanyImageKind,
  companyId: number,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const tr = await getTranslations();
  try {
    const previous = await currentImage(companyId, kind);
    if (previous === undefined) {
      return actionError(tr("master.ownCompanies.notFound"));
    }
    await prisma.ownCompany.update({
      where: { id: companyId },
      data: columnData(kind, null),
    });
    await dropFile(previous);
    await recordAudit({
      action: "UPDATE",
      tableName: "own_companies",
      recordId: String(companyId),
      after: { [kind]: null },
    });
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr(OWN_COMPANY_IMAGE[kind].saveFailed), tr),
    );
  }
}

/** 印影を差し替える。 */
export function saveOwnCompanySeal(
  companyId: number,
  file: File,
): Promise<ActionResult> {
  return saveOwnCompanyImage("seal", companyId, file);
}

/** 印影を外す。 */
export function removeOwnCompanySeal(companyId: number): Promise<ActionResult> {
  return removeOwnCompanyImage("seal", companyId);
}
