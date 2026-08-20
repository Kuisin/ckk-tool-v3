/**
 * data.ts — 未処理出荷書 (SH03) のサーバーサイド取得。
 *
 * 2 つのキューを返す:
 *   1. 未手配     — 完了指示書の出来高が出荷書に載りきっていない注文明細
 *                   （＝ここから出荷書を起こす）。
 *   2. 出荷準備中 — SHIPPED でない出荷書（SH01 の部分集合）。
 *
 * 未手配は**注文明細**を単位にする（指示書ロット単位ではない）— 出荷書の作成
 * フォームが注文明細を起点に完了ロットから明細を組み立てるため、キューの行と
 * 作成の入口が同じ単位でないと「押しても何も選ばれていない」状態になる。
 * 出荷済み数量はロット番号ではなく shipping_order_items.order_line_id で数える
 * （ロット番号は任意列で、在庫保管の行などでは空になる）。
 */

import type { UnshippedOrderLineRow } from "@/components/shipping/pending-shipments/model";
import type { ShippingOrder } from "@/components/shipping/shipping-orders/model";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatOrderLineNumber, formatProductNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import {
  computeFinishedQuantity,
  STEP_LINK_STATE_SELECT,
  STEP_STATE_SELECT,
  toStepState,
} from "@/lib/workflow-core";
import { orderLineScopeWhere } from "../../sales/order-lines/data";
import { fetchShippingOrders } from "../shipping-orders/data";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
const LIST_FETCH_CAP = 1000;

/**
 * 未手配の対象になる注文明細のステータス。
 * SHIPPED は全量出荷済み、CANCELLED はもう出荷しない、DRAFT は枝番未採番。
 */
const OPEN_ORDER_LINE_STATUSES = [
  "CONFIRMED",
  "IN_PRODUCTION",
  "PARTIAL_SHIPPED",
] as const;

/** 出荷準備中とみなす出荷書ステータス（＝まだ出ていない）。 */
const OPEN_SHIPPING_STATUSES = ["DRAFT", "CONFIRMED"] as const;

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
 * 未手配キュー — 完了指示書の出来高が出荷書に載りきっていない注文明細。
 *
 * 完成数は指示書ごとに computeFinishedQuantity（工程 DAG の終端集計）で出す。
 * 予定数量ではなく実際の出来高を使うので、不良で減った分は未手配に出ない。
 */
export async function fetchUnshippedOrderLines(): Promise<
  UnshippedOrderLineRow[]
> {
  const authz = await checkPermission("shipping_order", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.orderLine.findMany({
    take: LIST_FETCH_CAP,
    // スコープ断片は AND で合成する — spread してはいけない。PLANT のみの
    // ユーザーでは orderLineScopeWhere が `workOrders` を**トップレベルに**
    // 返すので、spread すると下の完了指示書フィルタを黙って上書きしてしまう。
    where: {
      AND: [
        {
          branch: { not: null },
          status: { in: [...OPEN_ORDER_LINE_STATUSES] },
          // 完了指示書が 1 件も無ければ出荷できる現物がまだ無い。
          workOrders: { some: { status: "COMPLETED" } },
        },
        orderLineScopeWhere(authz.access, authz.userId),
      ],
    },
    include: {
      acceptance: { include: { customerBp: true } },
      product: true,
      workOrders: {
        where: { status: "COMPLETED" },
        // エンジンが読む列だけ（STEP_STATE_SELECT — workflow-core 参照）。
        // 全列 SELECT は列追加のたび migration 前の DB で P2022 に落ちる。
        select: {
          workOrderNumber: true,
          steps: { select: STEP_STATE_SELECT },
          stepLinks: { select: STEP_LINK_STATE_SELECT },
        },
        orderBy: { workOrderNumber: "asc" },
      },
      // 出荷書に載っている数量（下書きも「もう手配済み」として数える）。
      shippingItems: { select: { quantity: true } },
    },
    orderBy: [
      { acceptanceYearMonth: "desc" },
      { acceptanceSeq: "desc" },
      { branch: "asc" },
    ],
  });

  const out: UnshippedOrderLineRow[] = [];
  for (const r of rows) {
    if (r.branch == null) continue;
    const finishedQuantity = r.workOrders.reduce(
      (sum, wo) =>
        sum + computeFinishedQuantity(wo.steps.map(toStepState), wo.stepLinks),
      0,
    );
    const shippedQuantity = r.shippingItems.reduce(
      (sum, it) => sum + it.quantity,
      0,
    );
    const unshippedQuantity = finishedQuantity - shippedQuantity;
    // 出荷書に載りきっている明細はキューに出さない。
    if (unshippedQuantity <= 0) continue;
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
      finishedQuantity,
      shippedQuantity,
      unshippedQuantity,
      completedLots: r.workOrders.map((wo) => wo.workOrderNumber),
      deliveryDate: r.deliveryDate?.toISOString().slice(0, 10) ?? null,
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
    });
  }
  return out;
}

/** 出荷準備中キュー — まだ SHIPPED になっていない出荷書。 */
export function fetchOpenShippingOrders(): Promise<ShippingOrder[]> {
  return fetchShippingOrders({ status: { in: [...OPEN_SHIPPING_STATUSES] } });
}
