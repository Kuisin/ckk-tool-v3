/**
 * data.ts — 未処理指示書 (PD05) のサーバーサイド取得。
 *
 * 2 つのキューを返す:
 *   1. 未手配   — 確定済み注文明細のうち、指示書の予定数量が受注数量に
 *                 届いていないもの（＝ここから指示書を起こす）。
 *   2. 進行中   — COMPLETED / CANCELLED でない指示書（PD02 の部分集合）。
 *
 * どちらも既存アプリの取得経路を再利用する — 未手配は注文明細 (SA05) の
 * スコープ断片、進行中は指示書 (PD02) の fetchWorkOrders。この画面だけが
 * 別の可視範囲を持つことがないようにするため。
 */

import type { UnplannedOrderLineRow } from "@/components/production/pending-work-orders/model";
import type { WorkOrderRow } from "@/components/production/work-orders/model";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatOrderLineNumber, formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { orderLineScopeWhere } from "../../sales/order-lines/data";
import { fetchWorkOrders } from "../work-orders/data";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
const LIST_FETCH_CAP = 1000;

/**
 * 未手配の対象になる注文明細のステータス。
 * DRAFT は枝番未採番（注文請書の明細エディタの領分）、CANCELLED / SHIPPED は
 * もう指示書を起こさない。
 */
const OPEN_ORDER_LINE_STATUSES = [
  "CONFIRMED",
  "IN_PRODUCTION",
  "PARTIAL_SHIPPED",
] as const;

/** 進行中とみなす指示書ステータス（＝まだ処理が残っている）。 */
const OPEN_WORK_ORDER_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
] as const;

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
 * 未手配キュー — 指示書の予定数量が受注数量に届いていない確定済み注文明細。
 *
 * 予定数量はキャンセル済み指示書を除いて数える（キャンセルした分は作り直しの
 * 対象なので、また未手配へ戻る）。
 */
export async function fetchUnplannedOrderLines(): Promise<
  UnplannedOrderLineRow[]
> {
  const authz = await checkPermission("work_order", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.orderLine.findMany({
    take: LIST_FETCH_CAP,
    // スコープ断片は AND で合成する — spread してはいけない。PLANT のみの
    // ユーザーでは orderLineScopeWhere がリレーション条件を**トップレベルに**
    // 返すため、同名キーを持つ条件を書いたときに黙って消える。
    where: {
      AND: [
        {
          // 未確定（枝番なし）は公開番号を持たない — SA04 の明細エディタの領分。
          branch: { not: null },
          status: { in: [...OPEN_ORDER_LINE_STATUSES] },
        },
        orderLineScopeWhere(authz.access, authz.userId),
      ],
    },
    include: {
      acceptance: { include: { customerBp: true } },
      product: true,
      // 手配済み数量 = 指示書割当（work_order_order_lines）の合計。
      // キャンセル済み指示書の割当は除く（作り直しの対象 → 未手配へ戻る）。
      workOrderLinks: {
        where: { workOrder: { status: { not: "CANCELLED" } } },
        select: { quantity: true },
      },
      // 在庫分の指示書に回せる数（RESERVED のみ — 確定/解除は数えない）。
      reservations: {
        where: { status: "RESERVED" },
        select: { quantity: true },
      },
    },
    orderBy: [
      { acceptanceYearMonth: "desc" },
      { acceptanceSeq: "desc" },
      { branch: "asc" },
    ],
  });

  const out: UnplannedOrderLineRow[] = [];
  for (const r of rows) {
    if (r.branch == null) continue;
    const plannedQuantity = r.workOrderLinks.reduce(
      (sum, l) => sum + l.quantity,
      0,
    );
    const unplannedQuantity = r.quantity - plannedQuantity;
    // 手配済み（あるいは超過手配）の明細はキューに出さない。
    if (unplannedQuantity <= 0) continue;
    const number = formatOrderLineNumber({
      yearMonth: r.acceptanceYearMonth,
      seq: r.acceptanceSeq,
      branch: r.branch,
    });
    out.push({
      id: number,
      orderLineNumber: number,
      uuid: r.id,
      customerName: localized(
        r.acceptance.customerBp?.name as LocalizedText | null,
      ),
      productName: r.product ? productLabel(r.product) : (r.productText ?? "—"),
      quantity: r.quantity,
      plannedQuantity,
      unplannedQuantity,
      reservedStockQuantity: r.reservations.reduce(
        (sum, rv) => sum + Number(rv.quantity),
        0,
      ),
      workOrderCount: r.workOrderLinks.length,
      deliveryDate: r.deliveryDate?.toISOString().slice(0, 10) ?? null,
      status: r.status,
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    });
  }
  return out;
}

/** 進行中キュー — 完了・キャンセルでない指示書。 */
export function fetchOpenWorkOrders(): Promise<WorkOrderRow[]> {
  return fetchWorkOrders({ status: { in: [...OPEN_WORK_ORDER_STATUSES] } });
}
