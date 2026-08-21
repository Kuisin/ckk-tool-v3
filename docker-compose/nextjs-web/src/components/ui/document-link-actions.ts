"use server";

/**
 * document-link-actions.ts — リッチテキストの「文書リンク」用の文書検索。
 *
 * 文書番号（QOT-… / EST-… / 指示書番号 …）の部分一致で候補を返し、
 * 詳細ページへの**アプリ内パス**を組み立てる。外部 URL と違って索引
 * （短縮リンク）は挟まない — アプリ内なので確認ページを通す必要がない。
 *
 * 権限: 読めない文書は候補に出さない（種別ごとの permission_code を READ で確認）。
 *
 * **このファイルは async 関数しか export しないこと。** `"use server"` の制約で、
 * 定数を export するとクライアント側では配列ではなく Server Action の参照が
 * 渡り、`.map()` で落ちる。値の定義は document-link-types.ts に置く。
 */

import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatDocNumber,
  formatEstimateNumber,
  formatPriceListNumber,
  formatQuoteNumber,
  orderLineNumberOf,
  parseDocKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import {
  DOCUMENT_TYPE_PERMISSION,
  type DocumentHit,
  type DocumentLinkType,
} from "./document-link-types";

const LIMIT = 15;

/** 数値化できる検索語だけ返す（指示書番号は整数）。 */
function asInt(query: string): number | null {
  const n = Number(query.replace(/[^0-9]/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 文書番号の末尾連番部分を取り出す（"QOT-202608-00012" → 12）。 */
function seqFromQuery(query: string): number | null {
  const digits = query.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits.slice(-5));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * 文書を検索する。`query` は文書番号の一部（数字だけでも可）。
 * 読み取り権限が無い種別は常に空配列。
 */
export async function searchDocuments(
  type: DocumentLinkType,
  query: string,
): Promise<DocumentHit[]> {
  const permission = DOCUMENT_TYPE_PERMISSION[type];
  if (!permission) return [];
  const authz = await checkPermission(permission, "READ");
  if (!authz.ok) return [];

  const q = query.trim();
  const seq = seqFromQuery(q);
  const name = (v: unknown) => localized(v as LocalizedText | null);

  try {
    switch (type) {
      case "quote": {
        const rows = await prisma.quote.findMany({
          where: seq ? { seq } : undefined,
          orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
          take: LIMIT,
          include: { customerBp: { select: { name: true } } },
        });
        return rows.map((r) => {
          const number = formatQuoteNumber(r);
          return {
            href: `/sales/quotes/${number}`,
            number,
            detail: name(r.customerBp?.name),
          };
        });
      }
      case "order_line": {
        const rows = await prisma.orderLine.findMany({
          // 確定済み（枝番あり）のみリンク可能 — 未確定は公開番号を持たない。
          where: {
            branch: { not: null },
            ...(seq ? { acceptanceSeq: seq } : {}),
          },
          orderBy: [
            { acceptanceYearMonth: "desc" },
            { acceptanceSeq: "desc" },
            { branch: "asc" },
          ],
          take: LIMIT,
          include: {
            acceptance: {
              select: { customerBp: { select: { name: true } } },
            },
          },
        });
        return rows.flatMap((r) => {
          const number = orderLineNumberOf(r);
          if (!number) return [];
          return [
            {
              href: `/sales/order-lines/${encodeURIComponent(number)}`,
              number,
              detail: name(r.acceptance.customerBp?.name),
            },
          ];
        });
      }
      case "work_order": {
        // 書類番号（WO-YYYYMM-NNNNN）でもロット番号（int）でも探せる
        const docKey = parseDocKey(q, "WO");
        const n = asInt(q);
        const rows = await prisma.workOrder.findMany({
          where: docKey
            ? { yearMonth: docKey.yearMonth, seq: docKey.seq }
            : n
              ? { workOrderNumber: n }
              : undefined,
          orderBy: { workOrderNumber: "desc" },
          take: LIMIT,
          include: { product: { select: { name: true } } },
        });
        return rows.map((r) => ({
          href: `/production/work-orders/${formatDocNumber("WO", r)}`,
          number: formatDocNumber("WO", r),
          detail: name(r.product?.name),
        }));
      }
      case "shipping_order": {
        const rows = await prisma.shippingOrder.findMany({
          where: seq ? { seq } : undefined,
          orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
          take: LIMIT,
        });
        return rows.map((r) => {
          const number = formatDocNumber("SHP", r);
          return {
            href: `/shipping/shipping-orders/${number}`,
            number,
            detail: "",
          };
        });
      }
      case "invoice": {
        const rows = await prisma.invoice.findMany({
          where: seq ? { seq } : undefined,
          orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
          take: LIMIT,
          include: { customerBp: { select: { name: true } } },
        });
        return rows.map((r) => {
          const number = formatDocNumber("INV", r);
          return {
            href: `/billing/invoices/${number}`,
            number,
            detail: name(r.customerBp?.name),
          };
        });
      }
      case "price_list": {
        const rows = await prisma.priceListEntry.findMany({
          where: seq ? { seq } : undefined,
          orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
          take: LIMIT,
          include: {
            customerBp: { select: { name: true } },
            product: { select: { name: true } },
          },
        });
        return rows.map((r) => {
          const number = formatPriceListNumber(r);
          return {
            href: `/sales/price-lists/${number}`,
            number,
            detail: `${name(r.customerBp?.name)} / ${name(r.product?.name)}`,
          };
        });
      }
      case "estimate": {
        const rows = await prisma.estimate.findMany({
          where: seq ? { seq } : undefined,
          orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
          take: LIMIT,
        });
        return rows.map((r) => {
          const number = formatEstimateNumber(r);
          return {
            href: `/sales/trial-estimates/${number}`,
            number,
            detail: r.name,
          };
        });
      }
      default:
        return [];
    }
  } catch (e) {
    console.error("searchDocuments failed", e);
    return [];
  }
}
