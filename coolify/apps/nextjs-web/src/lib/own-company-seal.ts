import "server-only";

/**
 * 自社法人の社印（電子印影）画像の保存・削除（MS0I）。
 *
 * **Server Action ではなく Route Handler（/api/master/own-companies/[id]/seal）
 * から呼ぶ** — 画像は Server Action の既定ボディ上限（1MB）に掛かり得るため、
 * フロアマップ・プロフィール写真と同じ方式に揃えている。
 *
 * 保存先は SeaweedFS `own-companies/seals/{系統的リネーム}` + files 行。
 * 旧画像は best-effort で削除する。SVG は受け付けない（中に <script> を書ける
 * — 監査 M1。PDF には data URI で埋め込むのでラスタで十分）。
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

/** 印影画像の最大サイズ（2MB）。印影は小さな画像で足りる。 */
export const MAX_SEAL_BYTES = 2 * 1024 * 1024;

/** 拡張子 → 許可する MIME。拡張子と中身の型が食い違うものは受け付けない。 */
const SEAL_TYPES: Record<string, string> = {
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

/** 印影を差し替える。RBAC・検証・保存・監査までを一貫して行う。 */
export async function saveOwnCompanySeal(
  companyId: number,
  file: File,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const tr = await getTranslations();

  if (file.size <= 0) return actionError(tr("common.selectAnImageFile"));
  if (file.size > MAX_SEAL_BYTES) {
    return actionError(tr("master.ownCompanies.sealTooLarge"));
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const mime = SEAL_TYPES[ext];
  if (!mime || mime !== file.type.toLowerCase()) {
    return actionError(
      tr("common.unsupportedImageFormat", { formats: "PNG / JPG" }),
    );
  }

  try {
    const company = await prisma.ownCompany.findUnique({
      where: { id: companyId },
      select: { sealFile: { select: { id: true, storageKey: true } } },
    });
    if (!company) return actionError(tr("master.ownCompanies.notFound"));

    const bytes = await file.arrayBuffer();
    const storageKey = `own-companies/seals/${systematicFileName(file.name)}`;
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
          data: { sealFileId: created.id },
        });
      });
    } catch (e) {
      await deleteObject(storageKey); // DB 失敗時は孤児を掃除
      throw e;
    }

    await dropFile(company.sealFile);
    await recordAudit({
      action: "UPDATE",
      tableName: "own_companies",
      recordId: String(companyId),
      after: { seal: file.name },
    });
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.ownCompanies.sealSaveFailed"), tr),
    );
  }
}

/** 印影を外す。 */
export async function removeOwnCompanySeal(
  companyId: number,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const tr = await getTranslations();
  try {
    const company = await prisma.ownCompany.findUnique({
      where: { id: companyId },
      select: { sealFile: { select: { id: true, storageKey: true } } },
    });
    if (!company) return actionError(tr("master.ownCompanies.notFound"));
    await prisma.ownCompany.update({
      where: { id: companyId },
      data: { sealFileId: null },
    });
    await dropFile(company.sealFile);
    await recordAudit({
      action: "UPDATE",
      tableName: "own_companies",
      recordId: String(companyId),
      after: { seal: null },
    });
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.ownCompanies.sealSaveFailed"), tr),
    );
  }
}
