/**
 * document-link-types.ts — 文書リンクの種別定義と view model（値の定義）。
 *
 * **なぜ actions 側に置かないのか**
 * `"use server"` のモジュールは **async 関数しか export できない**。定数を
 * そこから export すると、クライアントが受け取るのは配列ではなく Server Action
 * の参照になり、`.map()` した瞬間に TypeError で画面ごと落ちる
 * （実際にメモ編集が「このページを読み込めませんでした」になった原因）。
 * 値はこの普通のモジュールに置き、actions 側は型と関数だけを持つ。
 */

import type { useTranslations } from "next-intl";

/** 選択できる文書種別コード（表示ラベルは呼び出し側の `tr` で作る）。 */
export const DOCUMENT_LINK_TYPE_VALUES = [
  "quote",
  "order_line",
  "work_order",
  "delivery_order",
  "invoice",
  "price_list",
  "estimate",
] as const;

export type DocumentLinkType = (typeof DOCUMENT_LINK_TYPE_VALUES)[number];

/** 選択できる文書種別（ラベル付き）。 */
export function documentLinkTypes(
  tr: ReturnType<typeof useTranslations>,
): { value: DocumentLinkType; label: string }[] {
  return [
    { value: "quote", label: tr("common.quote") },
    { value: "order_line", label: tr("common.orderLine") },
    { value: "work_order", label: tr("common.workOrder") },
    { value: "delivery_order", label: tr("common.deliveryOrder") },
    { value: "invoice", label: tr("common.invoice") },
    { value: "price_list", label: tr("common.priceList") },
    { value: "estimate", label: tr("common.priceEstimate") },
  ];
}

export interface DocumentHit {
  /** 挿入するアプリ内パス。 */
  href: string;
  /** 文書番号（リンク文字列の既定値）。 */
  number: string;
  /** 補足（顧客名・製品名など）。 */
  detail: string;
}

/** 種別 → 権限コード（各画面の actions.ts と揃える）。 */
export const DOCUMENT_TYPE_PERMISSION: Record<DocumentLinkType, string> = {
  quote: "quote",
  order_line: "order_acceptance",
  work_order: "work_order",
  delivery_order: "delivery_order",
  invoice: "invoice",
  price_list: "price_list",
  estimate: "price_list",
};
