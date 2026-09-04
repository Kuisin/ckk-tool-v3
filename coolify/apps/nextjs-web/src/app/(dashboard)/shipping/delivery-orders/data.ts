/**
 * data.ts — 出荷書 (SH01) ページのサーバーサイド取得・マッピング。
 *
 * app.delivery_orders は (year_month, seq) の複合キー — 表示番号
 * DOR-YYYYMM-NNNNN は導出（保存しない）で、URL id を兼ねる。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import { plantWhere, rowInScope } from "@ckk/authz-core";
import {
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type DeliveryOrderType,
  previewAutoDeliveryNotes,
} from "@/components/shipping/delivery-orders/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DocKey,
  formatDocNumber,
  formatProductNumber,
  orderLineNumberOf,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

const DELIVERY_ORDER_INCLUDE = {
  // 顧客はヘッダが権威。注文明細は明細行ごとに紐付く。
  customerBp: true,
  customerBranchBp: true,
  createdByUser: { select: { displayName: true } },
  workOrder: true,
  fromPlant: true,
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      product: true,
      orderLine: {
        select: {
          acceptanceYearMonth: true,
          acceptanceSeq: true,
          branch: true,
          // 実効エンドユーザー = 明細の指定 ?? 注文請書ヘッダの既定。
          endUserBpId: true,
          endUserBp: { select: { name: true } },
          // 営業担当は書類に保存せず、注文請書ヘッダから導出する。
          // 配送方法・エンドユーザーも同じくヘッダが持つ（確定時の納品書自動作成の入力）。
          acceptance: {
            select: {
              salesRep: { select: { id: true, displayName: true } },
              deliveryMethod: true,
              endUserBpId: true,
              endUserBp: { select: { name: true } },
            },
          },
        },
      },
    },
  },
  deliveryNotes: {
    orderBy: [{ yearMonth: "asc" as const }, { seq: "asc" as const }],
    include: { recipientBp: true },
  },
};

type DeliveryOrderRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function findRow(key: DocKey) {
  return prisma.deliveryOrder.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    include: DELIVERY_ORDER_INCLUDE,
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

/**
 * 確定したときに自動作成される納品書の予告（確定モーダル用）。
 *
 * 入力の取り方は confirmDeliveryOrder の planDeliveryOrderNotes と同じ —
 * 発送 (DISPATCH) かつ明細ありのときだけ作られ、配送方法・エンドユーザーは
 * combinabilityError が全明細で揃えているので先頭行から読む。
 */
function autoDeliveryNotePreview(r: DeliveryOrderRow) {
  const customerName = localized(r.customerBp.name as LocalizedText | null);
  const first = r.items[0]?.orderLine;
  if (r.type !== "DISPATCH" || !first)
    return { notes: [], endUserMissing: false };
  const endUserBpId = first.endUserBpId ?? first.acceptance.endUserBpId ?? null;
  const endUserBp = first.endUserBp ?? first.acceptance.endUserBp ?? null;
  return previewAutoDeliveryNotes(
    {
      customerBpId: r.customerBpId,
      customerBranchBpId: r.customerBranchBpId,
      deliveryMethod: first.acceptance.deliveryMethod,
      endUserBpId,
    },
    {
      customer: r.customerBranchBp
        ? `${customerName} / ${localized(r.customerBranchBp.name as LocalizedText | null)}`
        : customerName,
      endUser: endUserBp
        ? localized(endUserBp.name as LocalizedText | null)
        : null,
    },
  );
}

function mapDeliveryOrder(r: DeliveryOrderRow): DeliveryOrder {
  const number = formatDocNumber("DOR", {
    yearMonth: r.yearMonth,
    seq: r.seq,
  });
  return {
    id: number,
    deliveryOrderNumber: number,
    customerId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    customerBranchName: r.customerBranchBp
      ? localized(r.customerBranchBp.name as LocalizedText | null)
      : null,
    // 営業担当は明細 → 注文請書ヘッダから導出（重複排除・明細順）。
    salesRepNames: [
      ...new Set(
        r.items
          .map((it) => it.orderLine?.acceptance.salesRep?.displayName)
          .filter((n): n is string => Boolean(n)),
      ),
    ],
    createdByName: r.createdByUser?.displayName ?? null,
    orderLineNumbers: [
      ...new Set(
        r.items
          .map((it) => (it.orderLine ? orderLineNumberOf(it.orderLine) : null))
          .filter((n): n is string => Boolean(n)),
      ),
    ],
    workOrderNumber: r.workOrder?.workOrderNumber ?? null,
    fromPlantId: r.fromPlantId != null ? String(r.fromPlantId) : null,
    fromPlantName: r.fromPlant
      ? localized(r.fromPlant.name as LocalizedText | null)
      : null,
    type: r.type as DeliveryOrderType,
    status: r.status as DeliveryOrderStatus,
    shippedAt: r.shippedAt?.toISOString() ?? null,
    notes: r.notes,
    items: r.items.map((it) => ({
      id: it.id,
      orderLineId: it.orderLineId,
      orderLineNumber: it.orderLine ? orderLineNumberOf(it.orderLine) : null,
      productId: String(it.productId),
      productName: productLabel(it.product),
      lotNumber: it.lotNumber,
      quantity: it.quantity,
      notes: it.notes,
    })),
    totalQuantity: r.items.reduce((sum, it) => sum + it.quantity, 0),
    deliveryNotes: r.deliveryNotes.map((dn) => ({
      deliveryNumber: formatDocNumber("DRN", {
        yearMonth: dn.yearMonth,
        seq: dn.seq,
      }),
      deliveryMethod: dn.deliveryMethod,
      recipientName: localized(dn.recipientBp.name as LocalizedText | null),
      status: dn.status,
      deliveredAt: dn.deliveredAt?.toISOString() ?? null,
    })),
    autoDeliveryNotes: autoDeliveryNotePreview(r),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * 一覧 — 新しい採番から順に。
 *
 * `extraWhere` は未処理出荷書 (SH03) の「出荷準備中」タブが未出荷だけを引く
 * ための追加条件。スコープ条件と AND で合成する。
 */
export async function fetchDeliveryOrders(
  extraWhere?: Prisma.DeliveryOrderWhereInput,
): Promise<DeliveryOrder[]> {
  // スコープ行フィルタ（PLANT = 出荷元拠点。ALL は {} で従来通り全件）。
  const authz = await checkPermission("delivery_order", "READ");
  if (!authz.ok) return [];
  const scope = plantWhere(
    authz.access,
    "fromPlantId",
  ) as Prisma.DeliveryOrderWhereInput;
  const rows = await prisma.deliveryOrder.findMany({
    take: LIST_FETCH_CAP,
    where: extraWhere ? { AND: [scope, extraWhere] } : scope,
    include: DELIVERY_ORDER_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map(mapDeliveryOrder);
}

/** 1件取得 — 未存在・スコープ外は null。 */
export async function fetchDeliveryOrder(
  key: DocKey,
): Promise<DeliveryOrder | null> {
  const authz = await checkPermission("delivery_order", "READ");
  if (!authz.ok) return null;
  const row = await findRow(key);
  if (!row) return null;
  if (
    !rowInScope(authz.access, { plantIds: [row.fromPlantId] }, authz.userId)
  ) {
    return null;
  }
  return mapDeliveryOrder(row);
}

/**
 * `?workOrder=` で出荷書フォームを開くときの種（指示書詳細 PD22 の
 * 「次のステップ: 出荷書の作成」から来る）。
 *
 * 出荷書の明細は**注文明細**を単位に組み立てるので（フォームの
 * addSourceGroups と未処理出荷書 SH03 が同じ単位）、指示書はまず自分が
 * 割り当てられている注文明細へ変換する。同じ注文請書の**他の**明細は
 * フォーム側が `fetchDeliveryAcceptanceSourceInfo` で引き直して
 * 「まとめて出荷しますか」と聞く — ここでは聞く相手（注文請書）だけを返す。
 *
 * 在庫向けの独立指示書（割当ゼロ）は注文明細を持たないので null を返す。
 */
export async function fetchWorkOrderDeliverySeed(
  workOrderNumber: number,
): Promise<{
  workOrderNumber: number;
  /** この指示書が充当している注文明細（確定済み = 枝番ありのみ）。 */
  orderLineIds: string[];
  /** 上の明細が属する注文請書の番号（重複なし・昇順）。 */
  acceptanceNumbers: string[];
} | null> {
  const authz = await checkPermission("delivery_order", "READ");
  if (!authz.ok) return null;
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNumber },
    select: {
      orderLineLinks: {
        orderBy: { sortOrder: "asc" },
        select: {
          orderLine: {
            select: {
              id: true,
              branch: true,
              acceptanceYearMonth: true,
              acceptanceSeq: true,
            },
          },
        },
      },
    },
  });
  if (!wo) return null;
  const lines = wo.orderLineLinks
    .map((l) => l.orderLine)
    .filter((l) => l.branch != null);
  if (lines.length === 0) return null;
  return {
    workOrderNumber,
    orderLineIds: lines.map((l) => l.id),
    acceptanceNumbers: [
      ...new Set(
        lines.map((l) =>
          formatDocNumber("ORD", {
            yearMonth: l.acceptanceYearMonth,
            seq: l.acceptanceSeq,
          }),
        ),
      ),
    ].sort(),
  };
}
