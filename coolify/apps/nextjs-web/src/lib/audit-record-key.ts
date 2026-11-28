/**
 * audit-record-key.ts — audit-record-key-core.ts の続き。server-only.
 *
 * 1 クエリが要る形だけをここに分離した（core 側は素の TS のまま・vitest で
 * 全形をテストする）:
 *  - `docKey` 形で、番号だけ・旧番号で渡されたもの（法人を引く）
 *  - `numberToUuid` 形（保存済みの一意な番号 → uuid PK）
 * `recordAudit` は既に async・best-effort・トランザクション外なので、この
 * 1 クエリを足すコストは許容できる。
 *
 * 呼び出し元は 2 つだけ:
 *  - `recordAudit()`（書き込み） — `needSince` を渡さない。
 *  - `fetchAuditEntries()`（読み込み） — `needSince: true` を渡し、書類の
 *    `created_at` を受け取って「前の世代」の孤児行を拾わないための境界に使う
 *    （[[approval-target-id-number-reuse]] の `targetCreatedAt` と同じ考え方）。
 */

import {
  auditKeyShape,
  isUuid,
  resolveAuditRecordKeySync,
} from "./audit-record-key-core";
import { prisma } from "./db";
import { DOC_TABLE_PREFIX } from "./doc-number";
import { toDocRef } from "./doc-ref";

export interface AuditKeyResolution {
  key: string | null;
  /** 対象行の created_at。docKey / numberToUuid 形で、かつ解決できたときだけ。 */
  since?: Date;
  /**
   * 同じ書類を指す**旧い形のキー**（読み出し専用）。素材発注書・購買依頼・
   * 設計依頼書・注文明細は、番号設計 PR-C まで行の uuid をキーにしていた。
   * その頃の監査行を履歴から落とさないために、読み出し側はこれも一緒に引く。
   */
  legacyKeys?: string[];
}

/** PR-C より前は uuid をキーにしていた表（{@link AuditKeyResolution.legacyKeys}）。 */
const UUID_KEYED_BEFORE = new Set([
  "material_purchase_orders",
  "purchase_requests",
  "design_requests",
  "order_lines",
]);

/**
 * docKey 形の表 → 参照（doc_ref / line_ref）で行を引き、created_at と uuid を返す。
 * 表名は登録簿（DOC_TABLE_PREFIX）にあるものだけ — 値は必ず $1。
 */
async function docRowByRef(
  tableName: string,
  ref: string,
): Promise<{ id: string; createdAt: Date } | undefined> {
  const column =
    tableName === "order_lines"
      ? "line_ref"
      : Object.hasOwn(DOC_TABLE_PREFIX, tableName)
        ? "doc_ref"
        : null;
  if (!column) return undefined;
  const rows = await prisma.$queryRawUnsafe<{ id: string; created_at: Date }[]>(
    `SELECT d."id"::text AS id, d."created_at" FROM "app"."${tableName}" d
      WHERE d."${column}" = $1 LIMIT 1`,
    ref,
  );
  const row = rows[0];
  return row ? { id: row.id, createdAt: row.created_at } : undefined;
}

/** numberToUuid 形（保存済みの一意な番号 / 特殊キー → uuid）。 */
async function resolveLookupKey(
  tableName: string,
  recordId: string,
  needSince: boolean,
): Promise<AuditKeyResolution> {
  const select = needSince
    ? ({ id: true, createdAt: true } as const)
    : ({ id: true } as const);

  switch (tableName) {
    case "form_responses": {
      const row = await prisma.formResponse.findUnique({
        where: { responseNumber: recordId },
        select,
      });
      return row ? { key: row.id, since: row.createdAt } : { key: null };
    }
    case "internal_pages": {
      const row = await prisma.internalPage.findUnique({
        where: { pageNumber: recordId },
        select,
      });
      return row ? { key: row.id, since: row.createdAt } : { key: null };
    }
    case "forms": {
      const row = await prisma.form.findUnique({
        where: { code: recordId },
        select,
      });
      return row ? { key: row.id, since: row.createdAt } : { key: null };
    }
    case "work_orders": {
      const n = Number(recordId);
      if (!Number.isInteger(n)) return { key: null };
      const row = await prisma.workOrder.findUnique({
        where: { workOrderNumber: n },
        select,
      });
      return row ? { key: row.id, since: row.createdAt } : { key: null };
    }
    case "users": {
      // 管理画面は uuid をそのまま渡す — 既にキーなのでクエリ不要。
      // プロフィール/アバターは username を渡す — 1 クエリで突合する。
      if (isUuid(recordId)) return { key: recordId };
      const row = await prisma.user.findUnique({
        where: { username: recordId },
        select,
      });
      return row ? { key: row.id, since: row.createdAt } : { key: null };
    }
    default:
      return { key: null };
  }
}

/**
 * `(tableName, recordId)` → 安定キー。書類は id（`CKK~QOT-…`）・参照
 * （`CKK/QOT-…`）・番号だけ・旧番号のどれで渡されてもよい。**例外を投げない** — 失敗しても
 * `recordAudit` の監査書き込み自体を止めないため（呼び出し元の唯一の
 * try/catch を汚さない）。
 *
 * `needSince: true` は読み出し側（`fetchAuditEntries`）専用 — 対象行の
 * `created_at` を返せるときだけ返し、番号再利用時の世代境界に使う。
 * 書き込み側（`recordAudit`）はこのオプションを渡さないので、追加コストを
 * 一切払わない。
 */
export async function resolveAuditRecordKey(
  tableName: string,
  recordId: string | null,
  opts: { needSince?: boolean } = {},
): Promise<AuditKeyResolution> {
  if (recordId == null || recordId.length === 0) return { key: null };
  try {
    const sync = resolveAuditRecordKeySync(tableName, recordId);
    if (auditKeyShape(tableName) === "docKey") {
      // 書類番号で指す書類 — キーは法人コード付きの参照（lib/doc-ref-core.ts）。
      // 法人コード付きで渡されればその場で決まる（sync）。番号だけ・旧番号は
      // 書類を引く。見つからなければ null（削除済み。record_id だけで残る）。
      const key =
        sync === undefined ? await toDocRef(tableName, recordId) : sync;
      if (key == null) return { key: null };
      if (!opts.needSince) return { key };
      const row = await docRowByRef(tableName, key);
      return {
        key,
        since: row?.createdAt,
        legacyKeys: row && UUID_KEYED_BEFORE.has(tableName) ? [row.id] : [],
      };
    }
    if (sync !== undefined) return { key: sync };
    return await resolveLookupKey(tableName, recordId, opts.needSince ?? false);
  } catch (e) {
    console.error("resolveAuditRecordKey failed", tableName, e);
    return { key: null };
  }
}
