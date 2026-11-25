"use server";

/**
 * document-link-actions.ts — リッチテキストの「文書リンク」用の文書検索。
 *
 * 文書番号（QOT-… / EST-… / 指示書番号 …。旧番号でも可）の部分一致で候補を返し、
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
  docIdOf,
  docNumberOf,
  orderLineIdOf,
  orderLineNumberOf,
} from "@/lib/doc-number";
import { docRefNumber } from "@/lib/doc-ref-core";
import {
  ESTIMATE_COST_PERMISSION,
  estimateKindWhere,
} from "@/lib/estimate-cost";
import { type LocalizedText, localized } from "@/lib/format";
import {
  DOCUMENT_TYPE_PERMISSION,
  type DocumentHit,
  type DocumentLinkType,
} from "./document-link-types";

const LIMIT = 15;

/** 数値化できる検索語だけ返す（指示書番号 = ロット番号は整数）。 */
function asInt(query: string): number | null {
  if (!/^\d+$/.test(query)) return null;
  const n = Number(query);
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

/** 検索語 → 番号の断片。法人コード付きの id / 参照を貼られたら法人コードは落とす。 */
function numberQuery(query: string): string {
  return docRefNumber(query).toUpperCase();
}

/**
 * 番号の部分一致（新しい番号 doc_number と旧番号 legacy_number の両方）。
 * 空の検索語は絞り込まない（新しい順の先頭を出す）。
 */
function numberWhere(query: string) {
  const q = numberQuery(query);
  if (!q) return {};
  return {
    OR: [{ docNumber: { contains: q } }, { legacyNumber: { contains: q } }],
  };
}

/** 新しい順（会計年度 → 連番。法人は混ざってよい）。 */
const NEWEST_FIRST = [
  { fiscalYear: "desc" as const },
  { docSeq: "desc" as const },
  { id: "desc" as const },
];

/**
 * 文書を検索する。`query` は文書番号の一部（数字だけでも可。旧番号でも可）。
 * 読み取り権限が無い種別は常に空配列。
 *
 * 返す `href` は法人コード付きの id（同じ番号が 2 つの法人にあっても行き先が
 * 決まる）、`number` は番号だけ（リンク文字列の既定値 = 人に見せる姿）。
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
  const where = numberWhere(q);
  const name = (v: unknown) => localized(v as LocalizedText | null);

  try {
    switch (type) {
      case "quote": {
        const rows = await prisma.quote.findMany({
          where,
          orderBy: NEWEST_FIRST,
          take: LIMIT,
          include: { customerBp: { select: { name: true } } },
        });
        return rows.map((r) => ({
          href: `/sales/quotes/${docIdOf(r)}`,
          number: docNumberOf(r),
          detail: name(r.customerBp?.name),
        }));
      }
      case "order_line": {
        const lineQuery = numberQuery(q);
        const rows = await prisma.orderLine.findMany({
          // 確定済み（枝番あり）のみリンク可能 — 未確定は公開番号を持たない。
          where: {
            lineRef: { not: null },
            ...(lineQuery
              ? {
                  OR: [
                    { lineNumber: { contains: lineQuery } },
                    { acceptance: { legacyNumber: { contains: lineQuery } } },
                  ],
                }
              : {}),
          },
          orderBy: [
            { acceptance: { fiscalYear: "desc" } },
            { acceptance: { docSeq: "desc" } },
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
          const id = orderLineIdOf(r);
          const number = orderLineNumberOf(r);
          if (!id || !number) return [];
          return [
            {
              href: `/sales/order-lines/${id}`,
              number,
              detail: name(r.acceptance.customerBp?.name),
            },
          ];
        });
      }
      case "work_order": {
        // 書類番号（WOR-FFFF-NNNNN・旧番号）でもロット番号（int）でも探せる。
        // リンク先はロット番号 — 指示書の URL の鍵は法人をまたぐ通し連番で、
        // 書類番号は法人ごとに重なり得る。
        const n = asInt(q);
        const rows = await prisma.workOrder.findMany({
          where: n ? { workOrderNumber: n } : where,
          orderBy: { workOrderNumber: "desc" },
          take: LIMIT,
          include: { productItem: { select: { name: true } } },
        });
        return rows.map((r) => ({
          href: `/production/work-orders/${r.workOrderNumber}`,
          number: docNumberOf(r),
          detail: name(r.productItem?.name),
        }));
      }
      case "delivery_order": {
        const rows = await prisma.deliveryOrder.findMany({
          where,
          orderBy: NEWEST_FIRST,
          take: LIMIT,
        });
        return rows.map((r) => ({
          href: `/shipping/delivery-orders/${docIdOf(r)}`,
          number: docNumberOf(r),
          detail: "",
        }));
      }
      case "invoice": {
        const rows = await prisma.invoice.findMany({
          where,
          orderBy: NEWEST_FIRST,
          take: LIMIT,
          include: { customerBp: { select: { name: true } } },
        });
        return rows.map((r) => ({
          href: `/billing/invoices/${docIdOf(r)}`,
          number: docNumberOf(r),
          detail: name(r.customerBp?.name),
        }));
      }
      case "price_list": {
        const rows = await prisma.priceListEntry.findMany({
          where,
          orderBy: NEWEST_FIRST,
          take: LIMIT,
          include: {
            customerBp: { select: { name: true } },
            // 品目統合 第 2 段 C — 価格表の製品名は品目側から読む。
            item: { select: { name: true } },
          },
        });
        return rows.map((r) => ({
          href: `/sales/price-lists/${docIdOf(r)}`,
          number: docNumberOf(r),
          detail: `${name(r.customerBp?.name)} / ${name(r.item?.name)}`,
        }));
      }
      case "estimate": {
        // 原価試算は estimate_cost の持ち主にしか候補に出さない。
        const costAuthz = await checkPermission(
          ESTIMATE_COST_PERMISSION,
          "READ",
        );
        const rows = await prisma.estimate.findMany({
          where: { AND: [where, estimateKindWhere(costAuthz.ok)] },
          orderBy: NEWEST_FIRST,
          take: LIMIT,
        });
        return rows.map((r) => ({
          href: `/sales/trial-estimates/${docIdOf(r)}`,
          number: docNumberOf(r),
          detail: r.name,
        }));
      }
      default:
        return [];
    }
  } catch (e) {
    console.error("searchDocuments failed", e);
    return [];
  }
}
