/**
 * attachments.ts — 汎用証憑（app.document_attachments）の読み書き。server-only.
 *
 * 任意の業務レコードにファイル（証憑 — 注文書控え・納品書控え・検収書 等）を
 * 紐付ける。owner は audit_logs と同じ規約:
 *   ownerType = テーブル名（@@map 値。例: "material_purchase_orders"）
 *   ownerId   = 業務キー文字列（PO 番号 "PO-…" / material_receipts は uuid）
 *
 * 実体は SeaweedFS（lib/storage）の `attachments/{ownerType}/{uuid}-{name}`
 * に置き、files 行 + document_attachments 行で参照する。添付・削除は owner
 * レコードの操作履歴（audit_logs, action=UPDATE）に note として残す。
 */

import type { AttachmentView } from "@/components/ui/AttachmentsPanel";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject, putObject } from "@/lib/storage";

/** 最大ファイルサイズ（20MB）。 */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * 許可する拡張子 → 許可する申告 MIME タイプ（先頭が正規の保存用 MIME）。
 * 拡張子と申告 MIME の両方がホワイトリストに一致しない限り受け付けない。
 */
const ALLOWED_TYPES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  heic: ["image/heic", "image/heif"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel"],
};

const ALLOWED_EXT_LABEL = "PDF / PNG / JPG / WEBP / HEIC / XLSX / CSV";

export interface SaveAttachmentInput {
  ownerType: string;
  ownerId: string;
  /** 表示区分（注文書控え 等・任意）。 */
  label?: string | null;
  file: {
    name: string;
    /** ブラウザ申告の MIME タイプ。 */
    type: string;
    bytes: ArrayBuffer;
  };
}

/**
 * ファイル検証 — 拡張子と申告 MIME の両方をホワイトリストで照合。
 * 戻り値: エラーメッセージ（正常時は正規化した保存用 MIME を返す）。
 */
function validateFile(
  name: string,
  declaredType: string,
  size: number,
): { ok: true; contentType: string } | { ok: false; error: string } {
  if (size <= 0) return { ok: false, error: "ファイルが空です" };
  if (size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "ファイルサイズは 20MB 以下にしてください" };
  }
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  const allowed = ext ? ALLOWED_TYPES[ext] : undefined;
  if (!allowed) {
    return {
      ok: false,
      error: `対応していないファイル形式です（${ALLOWED_EXT_LABEL}）`,
    };
  }
  if (!allowed.includes(declaredType.toLowerCase())) {
    return {
      ok: false,
      error: "ファイルの形式（MIME タイプ）が拡張子と一致しません",
    };
  }
  // 保存用 MIME は拡張子の正規値に寄せる（csv の vnd.ms-excel 等を統一）。
  return { ok: true, contentType: allowed[0] };
}

/** ストレージキー用にファイル名を無害化（ASCII 英数と . _ - のみ、80 文字まで）。 */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return (safe || "file").slice(0, 80);
}

/** 添付一覧（新しい順）。失敗時は空配列（画面を壊さない）。 */
export async function listAttachments(
  ownerType: string,
  ownerId: string,
): Promise<AttachmentView[]> {
  try {
    const rows = await prisma.documentAttachment.findMany({
      where: { ownerType, ownerId },
      orderBy: { createdAt: "desc" },
      include: {
        file: true,
        uploadedByUser: { select: { displayName: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      filename: r.file.filename,
      label: r.label,
      mimeType: r.file.mimeType,
      sizeBytes: Number(r.file.sizeBytes ?? 0),
      uploadedBy: r.uploadedByUser?.displayName ?? "システム",
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (e) {
    console.error("listAttachments failed", e);
    return [];
  }
}

/** 配信用のファイルメタ（GET /api/attachments/[id]）。不存在・不正 id は null。 */
export async function fetchAttachmentFile(id: string): Promise<{
  storageKey: string;
  filename: string;
  mimeType: string;
} | null> {
  try {
    const row = await prisma.documentAttachment.findUnique({
      where: { id },
      select: {
        file: { select: { storageKey: true, filename: true, mimeType: true } },
      },
    });
    return row?.file ?? null;
  } catch {
    // 不正な uuid 等 — 404 扱い。
    return null;
  }
}

/**
 * 証憑を保存する — ストレージ書き込み → files 行 + document_attachments 行
 * （nested create）→ owner の監査ログ（UPDATE + note）。
 */
export async function saveAttachment(
  input: SaveAttachmentInput,
): Promise<ActionResult<{ id: string }>> {
  const ownerType = input.ownerType.trim();
  const ownerId = input.ownerId.trim();
  if (!ownerType || !ownerId) {
    return actionError("添付対象が指定されていません");
  }

  const { name, type, bytes } = input.file;
  const checked = validateFile(name, type, bytes.byteLength);
  if (!checked.ok) return actionError(checked.error);

  const storageKey = `attachments/${ownerType}/${crypto.randomUUID()}-${sanitizeFilename(name)}`;
  if (!(await putObject(storageKey, bytes, checked.contentType))) {
    return actionError("ストレージへの保存に失敗しました");
  }

  try {
    const actor = await getCurrentActorId();
    // files 行 + document_attachments 行を 1 トランザクションで作成。
    const attachment = await prisma.$transaction(async (tx) => {
      const file = await tx.file.create({
        data: {
          storageKey,
          filename: name,
          mimeType: checked.contentType,
          sizeBytes: BigInt(bytes.byteLength),
          uploadedBy: actor,
        },
        select: { id: true },
      });
      return tx.documentAttachment.create({
        data: {
          ownerType,
          ownerId,
          label: input.label?.trim() || null,
          uploadedBy: actor,
          fileId: file.id,
        },
        select: { id: true },
      });
    });

    await recordAudit({
      action: "UPDATE",
      tableName: ownerType,
      recordId: ownerId,
      after: { note: `証憑を添付: ${name}` },
    });
    return actionOk({ id: attachment.id });
  } catch (e) {
    // DB 書き込みに失敗したらストレージ側の孤児を掃除（best-effort）。
    await deleteObject(storageKey);
    return actionError(prismaErrorMessage(e, "証憑の保存に失敗しました"));
  }
}

/**
 * 証憑を削除する — document_attachments 行 + files 行を削除し、
 * ストレージのオブジェクトは best-effort で消す（失敗しても成功扱い）。
 */
export async function deleteAttachment(id: string): Promise<ActionResult> {
  try {
    const row = await prisma.documentAttachment.findUnique({
      where: { id },
      include: { file: true },
    });
    if (!row) return actionError("添付ファイルが見つかりません");

    await prisma.documentAttachment.delete({ where: { id } });
    // files 行は添付専用のはずだが、他参照が残る場合（FK）は行とオブジェクトを温存。
    const fileDeleted = await prisma.file
      .delete({ where: { id: row.fileId } })
      .then(() => true)
      .catch(() => false);
    if (fileDeleted) {
      await deleteObject(row.file.storageKey); // best-effort
    }

    await recordAudit({
      action: "UPDATE",
      tableName: row.ownerType,
      recordId: row.ownerId,
      after: { note: `証憑を削除: ${row.file.filename}` },
    });
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "証憑の削除に失敗しました"));
  }
}
