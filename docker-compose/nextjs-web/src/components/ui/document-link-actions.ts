"use server";

/**
 * document-link-actions.ts — リッチテキストの「文書リンク」用の文書検索。
 *
 * 文書番号（QOT-… / EST-… / 指示書番号 …）の部分一致で候補を返し、
 * 詳細ページへの**アプリ内パス**を組み立てる。外部 URL と違って索引
 * （短縮リンク）は挟まない — アプリ内なので確認ページを通す必要がない。
 *
 * 権限: 読めない文書は候補に出さない（種別ごとの permission_code を READ で確認）。
 */

import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  formatDocNumber,
  formatEstimateNumber,
  formatPriceListNumber,
  formatQuoteNumber,
  formatSalesOrderNumber,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

const LIMIT = 15;

/** 選択できる文書種別。 */
export const DOCUMENT_LINK_TYPES = [
  { value: "quote", label: "見積書" },
  { value: "sales_order", label: "注文請書" },
  { value: "work_order", label: "指示書" },
  { value: "shipping_order", label: "出荷書" },
  { value: "invoice", label: "請求書" },
  { value: "price_list", label: "価格表" },
  { value: "estimate", label: "試算" },
] as const;

export type DocumentLinkType = (typeof DOCUMENT_LINK_TYPES)[number]["value"];

export interface DocumentHit {
  /** 挿入するアプリ内パス。 */
  href: string;
  /** 文書番号（リンク文字列の既定値）。 */
  number: string;
  /** 補足（顧客名・製品名など）。 */
  detail: string;
}

/** 種別 → 権限コード（各画面の actions.ts と揃える）。 */
const TYPE_PERMISSION: Record<DocumentLinkType, string> = {
  quote: "quote",
  sales_order: "work_order",
  work_order: "work_order",
  shipping_order: "shipping_order",
  invoice: "invoice",
  price_list: "price_list",
  estimate: "price_list",
};

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
  const permission = TYPE_PERMISSION[type];
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
      case "sales_order": {
        const rows = await prisma.salesOrder.findMany({
          where: seq ? { seq } : undefined,
          orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
          take: LIMIT,
          include: { customerBp: { select: { name: true } } },
        });
        return rows.map((r) => {
          const number = formatSalesOrderNumber(r);
          return {
            href: `/production/sales-orders/${encodeURIComponent(number)}`,
            number,
            detail: name(r.customerBp?.name),
          };
        });
      }
      case "work_order": {
        const n = asInt(q);
        const rows = await prisma.workOrder.findMany({
          where: n ? { workOrderNumber: n } : undefined,
          orderBy: { workOrderNumber: "desc" },
          take: LIMIT,
          include: { product: { select: { name: true } } },
        });
        return rows.map((r) => ({
          href: `/production/work-orders/${r.workOrderNumber}`,
          number: `指示書 #${r.workOrderNumber}`,
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
