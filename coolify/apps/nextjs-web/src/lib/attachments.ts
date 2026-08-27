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
import { systematicFileName } from "@/lib/file-naming";
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
 * 拡張子 → 保存用に正規化する MIME。**受付の可否はここで決めない。**
 *
 * 設計依頼には図面・3D モデル・仕様書など何が来るか分からないので、拡張子の
 * ホワイトリストで弾くのはやめた。代わりに **危険なのは「保存」ではなく
 * 「ブラウザ内で開くこと」** と割り切り、配信側（/api/attachments/[id] ・
 * /api/design-files/[id]）でインライン表示を PDF・画像・3D だけに絞っている。
 * SVG / HTML のようなスクリプトを含みうる形式は、受け取りはするが必ず
 * ダウンロード扱いにする（`INLINE_SAFE_TYPES` が唯一の判定元）。
 */
const CANONICAL_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  // 3D — ブラウザは MIME を持たないことが多いので拡張子から決める。
  stl: "model/stl",
  obj: "model/obj",
  gltf: "model/gltf+json",
  glb: "model/gltf-binary",
  ply: "application/octet-stream",
  step: "application/step",
  stp: "application/step",
  iges: "model/iges",
  igs: "model/iges",
  "3mf": "model/3mf",
  fbx: "application/octet-stream",
  dxf: "image/vnd.dxf",
  dwg: "image/vnd.dwg",
};

/**
 * **ブラウザ内で開いてよい** MIME。ここに無いものは配信時に必ず
 * `Content-Disposition: attachment` にする。XSS の入口になるのは
 * インライン表示だけなので、絞るのはここ 1 箇所でよい。
 * 3D は `<canvas>` へ自前で読み込むため inline 配信でよい（HTML として
 * 解釈されることはない）。
 */
export const INLINE_SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "model/stl",
  "model/obj",
  "model/gltf+json",
  "model/gltf-binary",
  "model/3mf",
  "model/iges",
  "application/step",
]);

/** その MIME をブラウザ内で開いてよいか（配信ルートの唯一の判定元）。 */
export function isInlineSafe(mimeType: string): boolean {
  return INLINE_SAFE_TYPES.has(mimeType.toLowerCase());
}

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
 * ファイル検証 — 大きさだけを見る。**形式では弾かない。**
 *
 * 保存用 MIME は拡張子の正規値に寄せ（ブラウザの申告はばらつくため）、
 * 知らない拡張子は application/octet-stream にする。octet-stream は
 * INLINE_SAFE_TYPES に無いので、配信時に必ずダウンロード扱いになる。
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
  const ext = name.includes(".")
    ? (name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const canonical = CANONICAL_TYPES[ext];
  if (canonical) return { ok: true, contentType: canonical };
  // 拡張子を知らない場合はブラウザの申告を使うが、スクリプトを含みうる形式は
  // 保存時点で octet-stream に落として、間違ってもインライン判定に入れない。
  const declared = declaredType.toLowerCase().trim();
  const risky =
    !declared ||
    declared.startsWith("text/html") ||
    declared.includes("svg") ||
    declared.includes("javascript") ||
    declared.includes("xml");
  return {
    ok: true,
    contentType: risky ? "application/octet-stream" : declared,
  };
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
      fileId: r.fileId,
      filename: r.file.filename,
      label: r.label,
      isLocked: r.isLocked,
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
  ownerType: string;
} | null> {
  try {
    const row = await prisma.documentAttachment.findUnique({
      where: { id },
      select: {
        ownerType: true,
        file: { select: { storageKey: true, filename: true, mimeType: true } },
      },
    });
    return row?.file ? { ...row.file, ownerType: row.ownerType } : null;
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

  // 系統的リネーム（lib/file-naming）: 時刻+乱数で一意、業務キーで判別可能。
  const storageKey = `attachments/${ownerType}/${systematicFileName(name, ownerId)}`;
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
    // 取込元の原本など、システムが付けた添付は消させない（内容を確かめる唯一の根拠）。
    if (row.isLocked) {
      return actionError(
        "この添付は削除できません（取込元の原本としてロックされています）",
      );
    }

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
