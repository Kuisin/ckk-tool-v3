/**
 * data.ts — 受注明細 (SA05) ページのサーバーサイド取得・マッピング。
 *
 * app.order_lines は受注請書キー (acceptance_year_month, acceptance_seq) +
 * 枝番 branch の複合キー — 表示番号 ORD-YYYYMM-NNNNN-NN は導出（保存しない）で、
 * URL id を兼ねる。枝番は確定時に採番されるため、**この画面は確定済み
 * （branch != null）だけを扱う**。確定前の明細は受注請書 (SA04) の明細エディタ。
 *
 * 顧客・注文書番号・見積キー・作成者は行に複写せず、受注請書ヘッダから読む。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import { type Access, ownOrPlantWhere, rowInScope } from "@ckk/authz-core";
import type {
  OrderLine,
  OrderLineStatus,
} from "@/components/sales/order-lines/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  formatDocNumber,
  formatOrderLineNumber,
  formatProductNumber,
  formatQuoteNumber,
  type OrderLineKey,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

const ORDER_LINE_INCLUDE = {
  // 顧客・注文書番号・見積キー・作成者はヘッダから
  acceptance: {
    include: { customerBp: true, customerBranchBp: true },
  },
  endUserBp: true,
  product: true,
  workOrders: {
    orderBy: { workOrderNumber: "asc" as const },
    // スコープ判定（PLANT = 配下指示書の工程実施拠点）にも使う。
    include: { steps: { select: { plantId: true } } },
  },
  // §4 在庫照合の引当済みサマリ用（予約中のみ — 確定/解除は数えない）。
  reservations: {
    where: { status: "RESERVED" as const },
    select: { quantity: true },
  },
  // 出荷進捗（§8）— 出荷書は明細行経由で紐付く（1 出荷書に複数受注明細）。
  // ここで拾えるのは「この受注明細ぶんの数量」だけで、出荷書全体ではない。
  shippingItems: {
    select: {
      quantity: true,
      shippingOrder: {
        select: {
          yearMonth: true,
          seq: true,
          type: true,
          status: true,
          shippedAt: true,
        },
      },
    },
    orderBy: [
      { shippingOrderYearMonth: "desc" as const },
      { shippingOrderSeq: "desc" as const },
    ],
  },
};

type OrderLineRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function findRow(key: OrderLineKey) {
  return prisma.orderLine.findUnique({
    where: {
      acceptanceYearMonth_acceptanceSeq_branch: {
        acceptanceYearMonth: key.yearMonth,
        acceptanceSeq: key.seq,
        branch: key.branch,
      },
    },
    include: ORDER_LINE_INCLUDE,
  });
}

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

function mapOrderLine(r: OrderLineRow): OrderLine {
  // この関数は確定済み行（branch != null）のみを受ける — 呼び出し側で絞る。
  const number = formatOrderLineNumber({
    yearMonth: r.acceptanceYearMonth,
    seq: r.acceptanceSeq,
    branch: r.branch ?? 0,
  });
  const acc = r.acceptance;
  return {
    id: number,
    orderNumber: number,
    uuid: r.id,
    acceptanceNumber: formatDocNumber("ORD", {
      yearMonth: r.acceptanceYearMonth,
      seq: r.acceptanceSeq,
    }),
    customerId: acc.customerBpId,
    customerName: localized(acc.customerBp?.name as LocalizedText | null),
    customerBranchId: acc.customerBranchBpId,
    customerBranchName: acc.customerBranchBp
      ? localized(acc.customerBranchBp.name as LocalizedText | null)
      : null,
    endUserName: r.endUserBp
      ? localized(r.endUserBp.name as LocalizedText | null)
      : null,
    customerOrderRef: acc.customerOrderRef,
    quoteNumber:
      acc.quoteYearMonth && acc.quoteSeq != null
        ? formatQuoteNumber({
            yearMonth: acc.quoteYearMonth,
            seq: acc.quoteSeq,
          })
        : null,
    productId: r.productId == null ? null : String(r.productId),
    productName: r.product ? productLabel(r.product) : (r.productText ?? "—"),
    orderType: r.orderType,
    quantity: r.quantity,
    unitPrice: r.unitPrice == null ? null : Number(r.unitPrice),
    amount: r.amount == null ? null : Number(r.amount),
    deliveryDate: r.deliveryDate?.toISOString().slice(0, 10) ?? null,
    lotNumber: r.lotNumber,
    status: r.status as OrderLineStatus,
    isLocked: r.isLocked,
    // 引当済み数 = この受注明細の予約中（RESERVED）予約の合計。
    reservedStockQuantity: r.reservations.reduce(
      (sum, rv) => sum + Number(rv.quantity),
      0,
    ),
    notes: r.notes,
    workOrders: r.workOrders.map((w) => ({
      workOrderNumber: w.workOrderNumber,
      type: w.type,
      plannedQuantity: w.plannedQuantity,
      approvalStatus: w.approvalStatus,
      status: w.status,
    })),
    // 出荷済み数量 = SHIPPED な発送（DISPATCH）出荷書における**この明細ぶん**の合計
    shippedQuantity: r.shippingItems
      .filter(
        (it) =>
          it.shippingOrder.type === "DISPATCH" &&
          it.shippingOrder.status === "SHIPPED",
      )
      .reduce((sum, it) => sum + it.quantity, 0),
    shippingOrders: r.shippingItems.map((it) => ({
      number: formatDocNumber("SHP", {
        yearMonth: it.shippingOrder.yearMonth,
        seq: it.shippingOrder.seq,
      }),
      type: it.shippingOrder.type,
      status: it.shippingOrder.status,
      quantity: it.quantity,
      shippedAt: it.shippingOrder.shippedAt?.toISOString() ?? null,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * 受注明細のスコープ where 断片（PLANT = 配下指示書の工程実施拠点経由 ∪
 * OWN = 受注請書の作成者）。ALL は {} — 従来通り全件。
 */
function orderLineScopeWhere(
  access: Access,
  userId: string,
): Prisma.OrderLineWhereInput {
  const w = ownOrPlantWhere(access, userId, {
    plantClause: (ids) => ({
      workOrders: { some: { steps: { some: { plantId: { in: ids } } } } },
    }),
    ownColumn: "createdBy",
  }) as Prisma.OrderLineWhereInput & {
    OR?: { createdBy?: string }[];
    createdBy?: string;
  };
  // createdBy は行に無い — 受注請書ヘッダへ読み替える。
  const remap = (c: Prisma.OrderLineWhereInput & { createdBy?: string }) =>
    c.createdBy === undefined
      ? c
      : ({
          acceptance: { createdBy: c.createdBy },
        } as Prisma.OrderLineWhereInput);
  if (Array.isArray(w.OR)) {
    return { ...w, OR: w.OR.map(remap) } as Prisma.OrderLineWhereInput;
  }
  return remap(w);
}

/** 取得済み受注明細行（workOrders.steps 付き）がスコープ内か。 */
function orderLineRowInScope(
  access: Access,
  userId: string,
  row: {
    acceptance: { createdBy: string | null };
    workOrders: { steps: { plantId: number | null }[] }[];
  },
): boolean {
  return rowInScope(
    access,
    {
      plantIds: row.workOrders.flatMap((w) => w.steps.map((s) => s.plantId)),
      createdBy: row.acceptance.createdBy,
    },
    userId,
  );
}

/** 一覧 — 確定済みのみ、新しい採番から順に。 */
export async function fetchOrderLines(): Promise<OrderLine[]> {
  const authz = await checkPermission("order_acceptance", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.orderLine.findMany({
    take: LIST_FETCH_CAP,
    where: {
      // 未確定（枝番なし）は公開番号を持たない — SA04 の明細エディタの領分。
      branch: { not: null },
      ...orderLineScopeWhere(authz.access, authz.userId),
    },
    include: ORDER_LINE_INCLUDE,
    orderBy: [
      { acceptanceYearMonth: "desc" },
      { acceptanceSeq: "desc" },
      { branch: "asc" },
    ],
  });
  return rows.map(mapOrderLine);
}

/** 1件取得 — キー不一致・未存在・スコープ外は null。 */
export async function fetchOrderLine(
  key: OrderLineKey,
): Promise<OrderLine | null> {
  const authz = await checkPermission("order_acceptance", "READ");
  if (!authz.ok) return null;
  const row = await findRow(key);
  if (!row) return null;
  if (!orderLineRowInScope(authz.access, authz.userId, row)) return null;
  return mapOrderLine(row);
}
