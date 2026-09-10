/**
 * delivery-variance.ts — 過不足納品の判定に必要な値を DB から集める（server-only）。
 *
 * 規則そのものは持たない。持っているのは lib/delivery-variance-core.ts で、
 * ここは「その関数に渡す数字を、正しい範囲から数えて集める」だけ。
 *
 * 数え方に 2 つ落とし穴があり、どちらも実際に踏むと静かに壊れる:
 *
 *   1. **累計で数える。** 判定の相手は「その注文明細について顧客が受け取る総量」で、
 *      この出荷書 1 通の数量ではない。50 + 48 と分けて出したとき 2 通目だけを見て
 *      「52 不足」と言っても、顧客との約束とは何の関係も無い。
 *
 *   2. **自分を二重に数えない。** 保存済みの出荷書を編集・確定するときは、
 *      その出荷書の行が既に DB にある。除外キー（excludeKey）を渡さずに
 *      集計すると、入力値と保存値の両方が乗って倍になる。
 *
 * 「他の出荷書」の範囲は LINE_CONSUMING_DELIVERY_ORDER_WHERE（DISPATCH の
 * 下書き・確定・出荷済）— 過出荷ガードや SH03 の未手配数と同じ条件で、
 * ここだけ別の数え方をすると画面ごとに残数が違って見える。
 */

import "server-only";

import { prisma } from "./db";
import {
  DEFAULT_DELIVERY_TOLERANCE,
  type DeliveryTolerance,
  type DeliveryVarianceVerdict,
  evaluateDeliveryVariance,
  lineVariancePermitted,
} from "./delivery-variance-core";
import type { DocKey } from "./doc-number";
import { formatOrderLineNumber } from "./doc-number";
import { LINE_CONSUMING_DELIVERY_ORDER_WHERE } from "./order-line-core";

/**
 * 顧客の過不足設定。顧客属性が無い（CUSTOMER ロール未付与・未入力）ときは
 * 既定 = 幅ゼロ・範囲外は承認必須。**設定漏れが最も緩くならない側**に倒す。
 */
export async function loadDeliveryTolerance(
  customerBpId: string | null,
): Promise<DeliveryTolerance> {
  if (!customerBpId) return DEFAULT_DELIVERY_TOLERANCE;
  const attrs = await prisma.bpCustomerAttrs.findUnique({
    where: { bpId: customerBpId },
    select: {
      deliveryToleranceBasis: true,
      deliveryToleranceUnder: true,
      deliveryToleranceOver: true,
      varianceApprovalWithin: true,
      varianceApprovalOutside: true,
    },
  });
  if (!attrs) return DEFAULT_DELIVERY_TOLERANCE;
  return {
    basis: attrs.deliveryToleranceBasis,
    under:
      attrs.deliveryToleranceUnder != null
        ? Number(attrs.deliveryToleranceUnder)
        : null,
    over:
      attrs.deliveryToleranceOver != null
        ? Number(attrs.deliveryToleranceOver)
        : null,
    approvalWithin: attrs.varianceApprovalWithin,
    approvalOutside: attrs.varianceApprovalOutside,
  };
}

/** 1 注文明細ぶんの過不足の状況。 */
export interface DeliveryVarianceLine {
  orderLineId: string;
  /** 表示番号 ORD-YYYYMM-NNNNN-NN（確定前は空文字）。 */
  orderLineNumber: string;
  orderedQuantity: number;
  /** この出荷書に載っている数量。 */
  thisQuantity: number;
  /** 他の出荷書に載っている数量（DISPATCH の下書き・確定・出荷済）。 */
  otherQuantity: number;
  /** 累計 = thisQuantity + otherQuantity。判定はこの数で行う。 */
  deliveredQuantity: number;
  /** 関連する指示書のどれかが「過不足のまま出してよい」と言っているか。 */
  variancePermitted: boolean;
  /** 数量そのものの評価（締めるかどうかは見ていない）。 */
  verdict: DeliveryVarianceVerdict;
  /**
   * この行が**過不足納品**にあたるか。
   *
   * 超過は常にそう。不足は**この出荷書が締めるときだけ**そうで、締めないなら
   * ただの一部出荷 — 残りは後から出る。ここを分けないと、100 本の受注に
   * 50 本を積んだ普通の分割出荷が「50 本不足」として決裁に回る。
   */
  isVarianceEvent: boolean;
}

export interface DeliveryVarianceSummary {
  lines: DeliveryVarianceLine[];
  /** 過不足納品にあたる行が 1 つでもあるか。 */
  hasVariance: boolean;
  /** 承認を経ないと確定できないか。 */
  approvalRequired: boolean;
  /**
   * 指示書の許可が無いのに受注数を超えている行 — **保存を拒む**。
   * 従来の過出荷ガードそのもので、許可が無い限り挙動は変わらない。
   */
  overWithoutPermission: DeliveryVarianceLine[];
  /**
   * 指示書の許可が無いのに不足で締めようとしている行 — **締めを拒む**。
   * 保存自体（= 一部出荷）は従来どおり通る。
   */
  shortCloseWithoutPermission: DeliveryVarianceLine[];
}

/**
 * 出荷書（保存前の入力でも、保存済みの行でもよい）の過不足を注文明細ごとに評価する。
 *
 * `items` はこの出荷書に**いま載せようとしている**行。`excludeKey` はその出荷書が
 * 既に DB にあるときのキー（自分自身を他の出荷書として数えないため）。
 * `closesOrderLines` は「この出荷で注文明細を締める」宣言 — 不足を過不足納品と
 * 見るかどうかがこれで決まる。
 */
export async function evaluateDeliveryOrderVariance(input: {
  customerBpId: string | null;
  items: readonly { orderLineId: string | null; quantity: number }[];
  closesOrderLines: boolean;
  excludeKey?: DocKey;
}): Promise<DeliveryVarianceSummary> {
  const empty: DeliveryVarianceSummary = {
    lines: [],
    hasVariance: false,
    approvalRequired: false,
    overWithoutPermission: [],
    shortCloseWithoutPermission: [],
  };

  const byLine = new Map<string, number>();
  for (const it of input.items) {
    if (!it.orderLineId) continue;
    byLine.set(it.orderLineId, (byLine.get(it.orderLineId) ?? 0) + it.quantity);
  }
  if (byLine.size === 0) return empty;

  const tolerance = await loadDeliveryTolerance(input.customerBpId);

  // 明細ごとに 3 本引くので、行数ぶん直列にすると詳細画面 1 枚で往復が積み上がる。
  // 明細どうしは互いに依存しないので並行に投げる。
  const lines = (
    await Promise.all(
      [...byLine].map(async ([orderLineId, thisQuantity]) =>
        evaluateOneLine(orderLineId, thisQuantity, tolerance, input),
      ),
    )
  ).filter((l): l is DeliveryVarianceLine => l != null);

  const events = lines.filter((l) => l.isVarianceEvent);
  return {
    lines,
    hasVariance: events.length > 0,
    approvalRequired: events.some((l) => l.verdict.approvalRequired),
    overWithoutPermission: lines.filter(
      (l) => l.verdict.kind === "OVER" && !l.variancePermitted,
    ),
    shortCloseWithoutPermission: lines.filter(
      (l) =>
        l.verdict.kind === "SHORT" &&
        input.closesOrderLines &&
        !l.variancePermitted,
    ),
  };
}

/** 注文明細 1 件ぶんの評価。消えた明細（参照切れ）は null。 */
async function evaluateOneLine(
  orderLineId: string,
  thisQuantity: number,
  tolerance: DeliveryTolerance,
  input: {
    closesOrderLines: boolean;
    excludeKey?: DocKey;
  },
): Promise<DeliveryVarianceLine | null> {
  const line = await prisma.orderLine.findUnique({
    where: { id: orderLineId },
    select: {
      quantity: true,
      acceptanceYearMonth: true,
      acceptanceSeq: true,
      branch: true,
    },
  });
  if (!line) return null;

  const [agg, workOrders] = await Promise.all([
    prisma.deliveryOrderItem.aggregate({
      _sum: { quantity: true },
      where: {
        orderLineId,
        deliveryOrder: LINE_CONSUMING_DELIVERY_ORDER_WHERE,
        ...(input.excludeKey
          ? {
              NOT: {
                deliveryOrderYearMonth: input.excludeKey.yearMonth,
                deliveryOrderSeq: input.excludeKey.seq,
              },
            }
          : {}),
      },
    }),
    // キャンセルされた指示書の許可は数えない — 取り消したロットの都合で
    // 過不足が通ってはいけない。
    prisma.workOrder.findMany({
      where: {
        orderLineLinks: { some: { orderLineId } },
        status: { not: "CANCELLED" },
      },
      select: { allowQuantityVariance: true },
    }),
  ]);

  const otherQuantity = agg._sum?.quantity ?? 0;
  const deliveredQuantity = thisQuantity + otherQuantity;
  const verdict = evaluateDeliveryVariance({
    orderedQuantity: line.quantity,
    deliveredQuantity,
    tolerance,
  });
  return {
    orderLineId,
    orderLineNumber:
      line.branch != null
        ? formatOrderLineNumber({
            yearMonth: line.acceptanceYearMonth,
            seq: line.acceptanceSeq,
            branch: line.branch,
          })
        : "",
    orderedQuantity: line.quantity,
    thisQuantity,
    otherQuantity,
    deliveredQuantity,
    variancePermitted: lineVariancePermitted(workOrders),
    verdict,
    isVarianceEvent:
      verdict.kind === "OVER" ||
      (verdict.kind === "SHORT" && input.closesOrderLines),
  };
}
