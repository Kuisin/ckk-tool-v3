/**
 * data.ts — 注文請書 intake (SA04) のサーバーサイド取得・マッピング。
 *
 * app.order_acceptances は (year_month, seq) の複合キー — 表示番号
 * ORD-YYYYMM-NNNNN は導出（保存しない）で、URL id を兼ねる。
 * 注文確定後は同じ (year_month, seq) の order_lines 枝番 1..N を持つため、
 * 詳細では確定済み注文明細番号も併せて返す。
 * Prisma Decimal はここで Number() へ、日付は ISO 文字列へ変換して渡す。
 */

import { ownWhere, rowInScope } from "@ckk/authz-core";
import type {
  AcceptanceLink,
  OrderAcceptanceItemView,
  OrderAcceptanceListRow,
  OrderAcceptanceStatus,
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
import { matchCustomer, suggestProducts } from "@/lib/intake";
import { normalizeExtraction } from "@/lib/intake-core";
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
    orderDate: r.orderDate?.toISOString().slice(0, 10) ?? null,
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
      shipToBp: { select: { name: true } },
      endUserBp: { select: { name: true } },
      assignedPlant: { select: { code: true, name: true } },
      shippingWorkLocation: {
        select: { name: true, group: { select: { name: true } } },
      },
      salesRep: { select: { id: true, displayName: true } },
      createdByUser: { select: { displayName: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: { select: { name: true, yearMonth: true, seq: true } },
          // 明細に割り当てられた指示書（分割・統合の割当数を表に出す）。
          workOrderLinks: {
            orderBy: { sortOrder: "asc" },
            select: {
              quantity: true,
              workOrder: { select: { workOrderNumber: true, status: true } },
            },
          },
        },
      },
    },
  });
  if (!r) return null;
  // スコープ外の行は不可視（null → 呼び出し側の notFound に乗せる）。
  if (!rowInScope(authz.access, { createdBy: r.createdBy }, authz.userId)) {
    return null;
  }

  // 確定済みの注文明細（枝番 1..N）。未確定行は公開番号を持たない。
  const orderLines = await prisma.orderLine.findMany({
    where: {
      acceptanceYearMonth: key.yearMonth,
      acceptanceSeq: key.seq,
      branch: { not: null },
    },
    orderBy: { branch: "asc" },
    select: { branch: true },
  });

  // 製品が決まっていない行は、読み取った品名から候補を出す（1 クエリでまとめて）。
  const productSuggestions = await suggestProducts(
    r.items
      .filter((it) => it.productId == null && it.productText)
      .map((it) => it.productText as string),
  );

  const items: OrderAcceptanceItemView[] = r.items.map((it) => ({
    id: it.id,
    // 確定済みの行は注文明細番号（枝番）を持つ — 明細表から SA25 へリンクする。
    lineNumber:
      it.branch != null
        ? formatOrderLineNumber({ ...key, branch: it.branch })
        : null,
    workOrders: it.workOrderLinks.map((l) => ({
      workOrderNumber: l.workOrder.workOrderNumber,
      quantity: l.quantity,
      status: l.workOrder.status,
    })),
    productId: it.productId != null ? String(it.productId) : null,
    productLabel: it.product ? productLabel(it.product) : null,
    productName: it.product
      ? localized(it.product.name as LocalizedText | null)
      : null,
    productText: it.productText,
    productSuggestions:
      (it.productId == null && it.productText
        ? productSuggestions.get(it.productText.trim())
        : null) ?? [],
    orderType: it.orderType,
    quantity: it.quantity,
    unitPrice: it.unitPrice != null ? Number(it.unitPrice) : null,
    deliveryDate: it.deliveryDate?.toISOString().slice(0, 10) ?? null,
    notes: it.notes,
  }));

  // 顧客が決まっていない取込は、その場でもう一度突合して**候補**を出す
  // （保存はしない — 選ぶのは人）。抽出 JSON は残っているので導出できる。
  const customerSuggestions =
    r.customerBpId || !r.extracted
      ? []
      : (
          await matchCustomer(
            normalizeExtraction(
              (r.extracted as { data?: unknown })?.data ?? r.extracted,
            ).customerName,
          )
        ).candidates;

  return {
    // 「何を読み取って、どれが引けなかったか」は保存済みの行と抽出 JSON から
    // その場で導く（別テーブルを持たない — 直せば指摘も自然に消える）。
    review: reviewIntake(r.extracted, {
      customerBpId: r.customerBpId,
      customerOrderRef: r.customerOrderRef,
      customerCandidateCount: customerSuggestions.length,
      orderDate: r.orderDate?.toISOString().slice(0, 10) ?? null,
      items: items.map((it) => ({
        productId: it.productId,
        productText: it.productText,
        productCandidateCount: it.productSuggestions.length,
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
    shipToBpId: r.shipToBpId,
    shipToName: r.shipToBp
      ? localized(r.shipToBp.name as LocalizedText | null)
      : null,
    deliveryMethod: r.deliveryMethod,
    endUserBpId: r.endUserBpId,
    endUserName: r.endUserBp
      ? localized(r.endUserBp.name as LocalizedText | null)
      : null,
    assignedPlantId:
      r.assignedPlantId != null ? String(r.assignedPlantId) : null,
    assignedPlantName: r.assignedPlant
      ? `${r.assignedPlant.code} ${localized(r.assignedPlant.name as LocalizedText | null)}`
      : null,
    shippingWorkLocationId:
      r.shippingWorkLocationId != null
        ? String(r.shippingWorkLocationId)
        : null,
    shippingWorkLocationName: r.shippingWorkLocation
      ? `${localized(r.shippingWorkLocation.group.name as LocalizedText | null)} / ${localized(r.shippingWorkLocation.name as LocalizedText | null)}`
      : null,
    customerSuggestions: customerSuggestions.map((c) => ({
      id: c.id,
      label: c.label,
      matchedKey: c.matchedKey,
    })),
    salesRepId: r.salesRep?.id ?? null,
    salesRepName: r.salesRep?.displayName ?? null,
    createdByName: r.createdByUser?.displayName ?? null,
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

/**
 * 担当拠点 Select 用（有効のみ、`コード 名称` ラベル）。
 * production/work-orders/data.ts の同名ヘルパと同じ形だが、
 * 画面系統が別（並行改修中）のため import せずローカルに持つ。
 */
export async function fetchPlantOptions(): Promise<
  { value: string; label: string }[]
> {
  const rows = await prisma.plant.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code} ${localized(r.name as LocalizedText | null)}`,
  }));
}

/**
 * 逆リンク — その見積書から起きた注文請書（新しい採番順）。
 *
 * 1 見積書から複数回受注することがあるので配列。キャンセル済みは出さない
 * （設計依頼の fetchLinks と同じ方針 — 起票し直した跡が並ぶだけのため）。
 */
export async function fetchOrderAcceptancesForQuote(key: {
  yearMonth: string;
  seq: number;
}): Promise<AcceptanceLink[]> {
  const rows = await prisma.orderAcceptance.findMany({
    where: {
      quoteYearMonth: key.yearMonth,
      quoteSeq: key.seq,
      status: { not: "CANCELLED" },
    },
    select: {
      yearMonth: true,
      seq: true,
      status: true,
      updatedAt: true,
      _count: { select: { items: true } },
    },
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
    take: 20,
  });
  return rows.map((r) => ({
    number: formatDocNumber("ORD", { yearMonth: r.yearMonth, seq: r.seq }),
    status: r.status as OrderAcceptanceStatus,
    orderLineCount: r._count.items,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
