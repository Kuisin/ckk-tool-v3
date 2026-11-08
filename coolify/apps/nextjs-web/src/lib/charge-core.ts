/**
 * charge-core.ts — 追加料金（送料・梱包費など）の決まり方。純ロジック・試験あり。
 *
 * 製品の代金以外に請求するものを表す場所がこれまで無く、備考に書いて人が
 * 請求書へ足すか、単価に混ぜて誤魔化すしかなかった。どちらも後から
 * 「何にいくら掛かったのか」を読めない。
 *
 * **金額の決まり方が 2 通りある**というのがこのファイルが持つ唯一の判断:
 *   FIXED    … 料金マスタの金額をそのまま使う。**使うときに変えられない** —
 *              社内で決めた梱包費のように、担当者ごとにぶれてはいけないもの。
 *   VARIABLE … 使うたびに人が入れる。マスタの金額は入力欄の既定値（目安）。
 *              送料のように実費が都度違うもの。
 *
 * 画面（入力欄を読み取り専用にするか）とサーバー（保存する金額）の両方が
 * ここを通る。片方だけで決めると、画面で編集できないはずの金額が API 経由で
 * 書き換えられる（あるいはその逆に、入れた金額が黙って捨てられる）。
 */

import { lineAmountYen } from "./money";

export type ChargeAmountMode = "FIXED" | "VARIABLE";

/** 料金マスタ 1 件のうち、金額の決まり方に関わる部分。 */
export interface ChargeItemRef {
  id: number;
  amountMode: ChargeAmountMode;
  /** FIXED では使う金額。VARIABLE では既定値（null = 既定値を出さない）。 */
  defaultAmount: number | null;
}

/** 金額を人が入れられるか（画面の入力欄の活性と同じ判定）。 */
export function isUnitPriceEditable(item: ChargeItemRef): boolean {
  return item.amountMode === "VARIABLE";
}

/**
 * 保存する単価。**FIXED はマスタの金額が勝つ** — 画面が何を送ってきても、
 * 入力欄を読み取り専用にした約束をサーバー側でも守る。
 *
 * FIXED で `defaultAmount` が未設定なのは「金額の決まっていない固定料金」= 設定漏れ。
 * 0 円として黙って通すと請求から落ちるので、呼び出し側が `chargeInputError` で
 * 先に弾く（ここは型の都合で 0 を返す）。
 */
export function resolveChargeUnitPrice(
  item: ChargeItemRef,
  entered: number | null | undefined,
): number {
  if (item.amountMode === "FIXED") return item.defaultAmount ?? 0;
  return entered ?? item.defaultAmount ?? 0;
}

/** 入力欄に出す既定値（VARIABLE のとき。null = 空のまま出す）。 */
export function defaultUnitPriceFor(item: ChargeItemRef): number | null {
  return item.amountMode === "FIXED"
    ? item.defaultAmount
    : (item.defaultAmount ?? null);
}

export interface ChargeLineInput {
  chargeItemId: number;
  quantity: number;
  /** 人が入れた単価（VARIABLE のときだけ効く）。 */
  unitPrice?: number | null;
}

/**
 * 1 行の検証。問題が無ければ null、あれば**理由の鍵**（next-intl の鍵）を返す。
 * 文言を返さないのは、サーバーと画面で同じ鍵を引けるようにするため。
 */
export function chargeInputError(
  line: ChargeLineInput,
  item: ChargeItemRef | undefined,
): string | null {
  if (!item) return "master.chargeItems.unknownChargeItem";
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    return "master.chargeItems.quantityMin1";
  }
  if (item.amountMode === "FIXED" && item.defaultAmount == null) {
    return "master.chargeItems.fixedNeedsAmount";
  }
  const unitPrice = resolveChargeUnitPrice(item, line.unitPrice);
  if (!Number.isFinite(unitPrice)) return "master.chargeItems.enterAnAmount";
  // 0 円は認める（無償対応の記録として行を残したいことがある）。負は認めない —
  // 値引きは価格表の値引きルールが持つ責務で、ここに混ぜると二重になる。
  if (unitPrice < 0) return "master.chargeItems.amountCannotBeNegative";
  return null;
}

/** 保存する 1 行（単価と金額を確定させたもの）。 */
export interface ResolvedChargeLine {
  chargeItemId: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/**
 * 入力 → 保存する行。金額は**円へ丸めてから**持つ（lib/money.ts の方針）ので、
 * 読み側は掛け算をやり直さない — やり直すと請求書と 1 円ずれる。
 */
export function resolveChargeLine(
  line: ChargeLineInput,
  item: ChargeItemRef,
): ResolvedChargeLine {
  const unitPrice = resolveChargeUnitPrice(item, line.unitPrice);
  return {
    chargeItemId: item.id,
    quantity: line.quantity,
    unitPrice,
    amount: lineAmountYen(unitPrice, line.quantity),
  };
}

/** 追加料金の合計（税抜）。 */
export function chargesTotal(lines: ReadonlyArray<{ amount: number }>): number {
  return lines.reduce((sum, l) => sum + l.amount, 0);
}
