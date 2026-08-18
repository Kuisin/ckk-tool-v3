/**
 * data.ts — 受注請書 intake (SA04) のサーバーサイド取得・マッピング。
 *
 * app.order_acceptances は (year_month, seq) の複合キー — 表示番号
 * ORD-YYYYMM-NNNNN は導出（保存しない）で、URL id を兼ねる。
 * 伝票展開後は同じ (year_month, seq) の order_lines 枝番 1..N を持つため、
 * 詳細では展開済み受注明細番号も併せて返す。
 * Prisma Decimal はここで Number() へ、日付は ISO 文字列へ変換して渡す。
 */

import { ownWhere, rowInScope } from "@ckk/authz-core";
import type {
  OrderAcceptanceItemView,
  OrderAcceptanceListRow,
  OrderAcceptanceView,
} from "@/components/sales/order-acceptances/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DocKey,
  formatDocNumber,
  formatOrderLineNumber,
  formatProductNumber,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { reviewIntake } from "@/lib/intake-review";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

/** 製品ラベル: 名称 + 製品コード（レガシーはコード未採番 → 名称のみ）。 */
function productLabel(p: {
  name: unknown;
  yearMonth: string | null;
  seq: number | null;
}): string {
  const code = formatProductNumber(p.yearMonth, p.seq);
  const name = localized(p.name as LocalizedText | null);
  return code ? `${name} ${code}` : name;
}

/** 一覧 — 新しい採番から順（取込状況一覧）。 */
export async function fetchOrderAcceptances(): Promise<
  OrderAcceptanceListRow[]
> {
  // スコープ行フィルタ（OWN = 自分の作成分のみ。ALL は {} で従来通り全件）。
  const authz = await checkPermission("order_acceptance", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.orderAcceptance.findMany({
    take: LIST_FETCH_CAP,
    where: ownWhere(
      authz.access,
      authz.userId,
      "createdBy",
    ) as Prisma.OrderAcceptanceWhereInput,
    include: {
      sourceFile: { select: { filename: true } },
      customerBp: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map((r) => ({
    number: formatDocNumber("ORD", r),
    status: r.status,
    source: r.source,
    sourceFilename: r.sourceFile?.filename ?? null,
    customerName: r.customerBp
      ? localized(r.customerBp.name as LocalizedText | null)
      : null,
    itemCount: r._count.items,
    extractError: r.extractError,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** 1件取得（詳細）。未存在は null。 */
export async function fetchOrderAcceptance(
  key: DocKey,
): Promise<OrderAcceptanceView | null> {
  const authz = await checkPermission("order_acceptance", "READ");
  if (!authz.ok) return null;
  const r = await prisma.orderAcceptance.findUnique({
    where: { yearMonth_seq: key },
    include: {
      sourceFile: { select: { filename: true, mimeType: true } },
      customerBp: { select: { name: true } },
      customerBranchBp: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: { select: { name: true, yearMonth: true, seq: true } },
        },
      },
    },
  });
  if (!r) return null;
  // スコープ外の行は不可視（null → 呼び出し側の notFound に乗せる）。
  if (!rowInScope(authz.access, { createdBy: r.createdBy }, authz.userId)) {
    return null;
  }

  // 確定済みの受注明細（枝番 1..N）。未確定行は公開番号を持たない。
  const orderLines = await prisma.orderLine.findMany({
    where: {
      acceptanceYearMonth: key.yearMonth,
      acceptanceSeq: key.seq,
      branch: { not: null },
    },
    orderBy: { branch: "asc" },
    select: { branch: true },
  });

  const items: OrderAcceptanceItemView[] = r.items.map((it) => ({
    id: it.id,
    productId: it.productId != null ? String(it.productId) : null,
    productLabel: it.product ? productLabel(it.product) : null,
    productText: it.productText,
    orderType: it.orderType,
    quantity: it.quantity,
    unitPrice: it.unitPrice != null ? Number(it.unitPrice) : null,
    deliveryDate: it.deliveryDate?.toISOString().slice(0, 10) ?? null,
    notes: it.notes,
  }));

  return {
    // 「何を読み取って、どれが引けなかったか」は保存済みの行と抽出 JSON から
    // その場で導く（別テーブルを持たない — 直せば指摘も自然に消える）。
    review: reviewIntake(r.extracted, {
      customerBpId: r.customerBpId,
      customerOrderRef: r.customerOrderRef,
      orderDate: r.orderDate?.toISOString().slice(0, 10) ?? null,
      items: items.map((it) => ({
        productId: it.productId,
        productText: it.productText,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
    }),
    number: formatDocNumber("ORD", r),
    yearMonth: r.yearMonth,
    seq: r.seq,
    status: r.status,
    source: r.source,
    sourceFilename: r.sourceFile?.filename ?? null,
    sourceMimeType: r.sourceFile?.mimeType ?? null,
    extractError: r.extractError,
    customerBpId: r.customerBpId,
    customerName: r.customerBp
      ? localized(r.customerBp.name as LocalizedText | null)
      : null,
    customerBranchName: r.customerBranchBp
      ? localized(r.customerBranchBp.name as LocalizedText | null)
      : null,
    customerOrderRef: r.customerOrderRef,
    quoteNumber:
      r.quoteYearMonth && r.quoteSeq != null
        ? formatDocNumber("QOT", {
            yearMonth: r.quoteYearMonth,
            seq: r.quoteSeq,
          })
        : null,
    orderDate: r.orderDate?.toISOString().slice(0, 10) ?? null,
    notes: r.notes,
    items,
    orderLineNumbers: orderLines.map((l) =>
      formatOrderLineNumber({ ...key, branch: l.branch as number }),
    ),
    completedAt: r.completedAt?.toISOString() ?? null,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
