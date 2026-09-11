/**
 * audit-record-key.ts — audit-record-key-core.ts の続き。server-only.
 *
 * `numberToUuid` 形（保存済みの一意な番号 → uuid PK）だけは 1 クエリが要る
 * ので、ここに分離した（core 側は素の TS のまま・vitest で全形をテストする）。
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
import { parseDocKey, parseOrderLineKey } from "./doc-number";

export interface AuditKeyResolution {
  key: string | null;
  /** 対象行の created_at。docKey / numberToUuid 形で、かつ解決できたときだけ。 */
  since?: Date;
}

/** docKey 形の複合キーを持つ 7 表 → createdAt を引く 1 クエリ。 */
async function docKeyCreatedAt(
  tableName: string,
  recordId: string,
): Promise<Date | undefined> {
  const key = parseDocKey(recordId);
  if (!key) return undefined;
  const where = { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } };
  switch (tableName) {
    case "quotes":
      return (
        await prisma.quote.findUnique({ where, select: { createdAt: true } })
      )?.createdAt;
    case "estimates":
      return (
        await prisma.estimate.findUnique({ where, select: { createdAt: true } })
      )?.createdAt;
    case "price_list_entries":
      return (
        await prisma.priceListEntry.findUnique({
          where,
          select: { createdAt: true },
        })
      )?.createdAt;
    case "order_acceptances":
      return (
        await prisma.orderAcceptance.findUnique({
          where,
          select: { createdAt: true },
        })
      )?.createdAt;
    case "delivery_orders":
      return (
        await prisma.deliveryOrder.findUnique({
          where,
          select: { createdAt: true },
        })
      )?.createdAt;
    case "delivery_notes":
      return (
        await prisma.deliveryNote.findUnique({
          where,
          select: { createdAt: true },
        })
      )?.createdAt;
    case "invoices":
      return (
        await prisma.invoice.findUnique({ where, select: { createdAt: true } })
      )?.createdAt;
    default:
      return undefined;
  }
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
    case "material_purchase_orders": {
      const row = await prisma.materialPurchaseOrder.findUnique({
        where: { poNumber: recordId },
        select,
      });
      return row ? { key: row.id, since: row.createdAt } : { key: null };
    }
    case "purchase_requests": {
      const row = await prisma.purchaseRequest.findUnique({
        where: { requestNumber: recordId },
        select,
      });
      return row ? { key: row.id, since: row.createdAt } : { key: null };
    }
    case "design_requests": {
      const row = await prisma.designRequest.findUnique({
        where: { requestNumber: recordId },
        select,
      });
      return row ? { key: row.id, since: row.createdAt } : { key: null };
    }
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
    case "order_lines": {
      const key = parseOrderLineKey(recordId);
      if (!key) return { key: null };
      const row = await prisma.orderLine.findUnique({
        where: {
          acceptanceYearMonth_acceptanceSeq_branch: {
            acceptanceYearMonth: key.yearMonth,
            acceptanceSeq: key.seq,
            branch: key.branch,
          },
        },
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
 * `(tableName, recordId)` → 安定キー。**例外を投げない** — 失敗しても
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
    if (sync !== undefined) {
      if (
        sync !== null &&
        opts.needSince &&
        auditKeyShape(tableName) === "docKey"
      ) {
        const since = await docKeyCreatedAt(tableName, recordId);
        return { key: sync, since };
      }
      return { key: sync };
    }
    return await resolveLookupKey(tableName, recordId, opts.needSince ?? false);
  } catch (e) {
    console.error("resolveAuditRecordKey failed", tableName, e);
    return { key: null };
  }
}
