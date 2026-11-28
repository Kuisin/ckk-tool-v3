/**
 * custom-value-approval-core.ts — 「独自値の追加承認」の純ロジック（I/O なし）。
 *
 * 書類の値には 2 通りの出どころがある:
 *
 *   引き継いだ値  前の書類が決めた値をそのまま使っている
 *                 （価格表の基準単価 = 価格試算の見積単価 / 注文請書の単価 = 価格表）
 *   独自値        この書類で人が決めた値（手入力・上書き・前の書類と違う値）
 *
 * 引き継いだ値は前の書類の段階で確かめられているが、独自値はこの書類で初めて
 * 出てくる判断なので、承認設定（MS0B）の「独自値の追加承認」の段を**通常の
 * フローの後ろに足す**。段は書類種別ごとに別建てで持ち、0 本なら何も足さない
 * （未設定 = 素通し）。
 *
 * ここが決めるのは 3 つだけ:
 *   - 何が独自値か（書類ごとの判定）
 *   - いまの承認を使い続けてよいか（保存し直したとき — 価格表）
 *   - 通常の段と独自値の段をどう 1 本に繋ぐか（承認エンジン）
 */

import type { AcceptancePriceState } from "./order-acceptance-price-core";

// ─── 段の連結（承認エンジン） ──────────────────────────────────────────────

/** 依頼時に連結した段の出どころ。通常の段は持たない（undefined）。 */
export type ApprovalStepLayer = "customValue";

/**
 * 通常の段の後ろに独自値の段を足す。段番号は通しで振り直す
 * （承認エンジンは 1..N の連番しか知らない）。独自値の段には `layer` を付け、
 * 画面がどこからが追加の承認かを示せるようにする。
 */
export function appendCustomValueSteps<T extends { stepNo: number }>(
  base: readonly T[],
  extra: readonly T[],
): (T & { layer?: ApprovalStepLayer })[] {
  return [
    ...base.map((s, i) => ({ ...s, stepNo: i + 1 })),
    ...extra.map((s, i) => ({
      ...s,
      stepNo: base.length + i + 1,
      layer: "customValue" as const,
    })),
  ];
}

// ─── 注文請書 ────────────────────────────────────────────────────────────────

/**
 * 注文請書の明細の単価が独自値か。**価格表どおり（onList）以外は全部**:
 *   override  人が上書きを宣言した単価
 *   diff      価格表と食い違う単価（確認して通したもの）
 *   noTier    価格表に数量段階が無く、人が入れた単価
 *   unpriced  価格表が無く、人が入れた単価
 * unresolved / unset は単価が決まっていない（承認依頼の前に readiness が止める）。
 */
export function isAcceptanceCustomPriceState(
  state: AcceptancePriceState,
): boolean {
  return (
    state === "override" ||
    state === "diff" ||
    state === "noTier" ||
    state === "unpriced"
  );
}

// ─── 価格表 ──────────────────────────────────────────────────────────────────

export type PriceListApprovalStatus =
  | "NONE"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

/** 独自値判定に使うバリアントの形（保存後に DB から読み直した値）。 */
export interface PriceVariantCustomInput {
  orderType: string;
  isActive: boolean;
  baseUnitPrice: number;
  /** 基準単価ソースの価格試算番号（手動設定は null）。 */
  estimateNumber: string | null;
  /** その価格試算の見積単価（引けなければ null）。 */
  estimateBase: number | null;
  tiers: readonly {
    minQuantity: number;
    maxQuantity: number | null;
    priceOverride: number | null;
  }[];
}

export type PriceListCustomValue =
  /** 価格試算を使わずに決めた基準単価。 */
  | { kind: "manualBase"; orderType: string; baseUnitPrice: number }
  /** 価格試算を選んだうえで、見積単価と違う基準単価にしたもの。 */
  | {
      kind: "baseDiffersFromEstimate";
      orderType: string;
      baseUnitPrice: number;
      estimateNumber: string;
      estimateBase: number;
    }
  /** 数量段階の単価を倍率ではなく手で決めたもの。 */
  | {
      kind: "tierOverride";
      orderType: string;
      minQuantity: number;
      maxQuantity: number | null;
      priceOverride: number;
    };

/** 円未満 2 桁で比べる（DB は numeric(12,2)、見積単価は計算値）。 */
const cents = (n: number) => Math.round(n * 100);

/**
 * 価格表の独自値。**無効なバリアントは数えない** — 価格の解決に使われない
 * 値は承認する意味が無い（有効に戻すのは保存なので、そのとき数え直す）。
 *
 * 倍率と値引きは数えない。どちらも価格表そのものの決まりで、引き継ぎ元に
 * 対応する値が無い（「引き継げたのに引き継がなかった」値ではない）。
 */
export function priceListCustomValues(
  variants: readonly PriceVariantCustomInput[],
): PriceListCustomValue[] {
  const out: PriceListCustomValue[] = [];
  const sorted = [...variants]
    .filter((v) => v.isActive)
    .sort((a, b) => a.orderType.localeCompare(b.orderType));
  for (const v of sorted) {
    if (!v.estimateNumber || v.estimateBase == null) {
      out.push({
        kind: "manualBase",
        orderType: v.orderType,
        baseUnitPrice: v.baseUnitPrice,
      });
    } else if (cents(v.baseUnitPrice) !== cents(v.estimateBase)) {
      out.push({
        kind: "baseDiffersFromEstimate",
        orderType: v.orderType,
        baseUnitPrice: v.baseUnitPrice,
        estimateNumber: v.estimateNumber,
        estimateBase: v.estimateBase,
      });
    }
    const tiers = [...v.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
    for (const t of tiers) {
      if (t.priceOverride == null) continue;
      out.push({
        kind: "tierOverride",
        orderType: v.orderType,
        minQuantity: t.minQuantity,
        maxQuantity: t.maxQuantity,
        priceOverride: t.priceOverride,
      });
    }
  }
  return out;
}

/**
 * 独自値の指紋。独自値が無ければ null。並びは priceListCustomValues が
 * 決めているので、同じ内容なら同じ文字列になる。
 */
export function customValueSignature(
  values: readonly PriceListCustomValue[],
): string | null {
  if (values.length === 0) return null;
  return JSON.stringify(values.map(signatureEntry));
}

function signatureEntry(v: PriceListCustomValue): unknown[] {
  switch (v.kind) {
    case "manualBase":
      return ["m", v.orderType, cents(v.baseUnitPrice)];
    case "baseDiffersFromEstimate":
      return [
        "e",
        v.orderType,
        cents(v.baseUnitPrice),
        v.estimateNumber,
        cents(v.estimateBase),
      ];
    case "tierOverride":
      return [
        "t",
        v.orderType,
        v.minQuantity,
        v.maxQuantity,
        cents(v.priceOverride),
      ];
  }
}

export type CustomValueApprovalDecision =
  /** 承認不要にする（独自値が無い / 段が組まれていない）。進行中の依頼は取り下げる。 */
  | { kind: "clear" }
  /** いまの承認（進行中 or 承認済み）をそのまま使う。 */
  | { kind: "keep" }
  /** 承認を（やり直して）依頼する。 */
  | { kind: "request" };

/**
 * 保存し直した価格表の承認をどうするか。
 *
 * 独自値が**変わっていなければ**いまの承認を使い続ける — 営業担当や有効期間
 * だけを直した保存で、承認済みの価格表が承認待ちに戻ると、その間ずっと
 * 見積書・注文請書から引けなくなる。差し戻し済みは同じ内容でも依頼し直す
 * （直さずに出し直すことも、出す側の判断として認める）。
 */
export function decideCustomValueApproval(input: {
  status: PriceListApprovalStatus;
  signature: string | null;
  nextSignature: string | null;
  layerConfigured: boolean;
}): CustomValueApprovalDecision {
  if (input.nextSignature == null || !input.layerConfigured)
    return { kind: "clear" };
  if (
    (input.status === "PENDING" || input.status === "APPROVED") &&
    input.signature === input.nextSignature
  )
    return { kind: "keep" };
  return { kind: "request" };
}

/**
 * 価格の解決に使ってよい価格表か。承認待ち・差し戻しの価格表は、承認が
 * 下りるまで見積書・注文請書から引かない（引けた時点で独自値が承認なしに
 * 書類へ流れ込むため）。
 */
export function priceEntryUsable(
  status: PriceListApprovalStatus | undefined,
): boolean {
  return status !== "PENDING" && status !== "REJECTED";
}
