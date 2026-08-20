/**
 * model.ts — 注文請書 intake (SA04) の client-safe view model と表示定数。
 *
 * ライフサイクル: IMPORT（取込・抽出中/失敗）→ DRAFT（抽出済・編集可）→
 * REQUESTED（承認依頼）→ APPROVED → COMPLETED（確定済）→ ARCHIVED。
 * サーバー側のマッピングは app/(dashboard)/sales/order-acceptances/data.ts。
 */

export type OrderAcceptanceStatus =
  | "IMPORT"
  | "DRAFT"
  | "REQUESTED"
  | "APPROVED"
  | "COMPLETED"
  | "ARCHIVED";

export type IntakeSource = "FOLDER" | "UPLOAD" | "MANUAL";

/** 取込元 → バッジ表示（ラベル + 色）。 */
export const INTAKE_SOURCE_BADGE: Record<
  IntakeSource,
  { label: string; color: string }
> = {
  FOLDER: { label: "監視フォルダ", color: "teal" },
  UPLOAD: { label: "優先取込", color: "blue" },
  MANUAL: { label: "手入力", color: "gray" },
};

import type { FieldReview } from "@/lib/intake-review";

/** 一覧（取込状況一覧）の 1 行。 */
export interface OrderAcceptanceListRow {
  /** 表示番号 ORD-YYYYMM-NNNNN（URL id 兼用）。 */
  number: string;
  status: OrderAcceptanceStatus;
  source: IntakeSource;
  sourceFilename: string | null;
  customerName: string | null;
  itemCount: number;
  extractError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 明細 1 行（詳細）。 */
export interface OrderAcceptanceItemView {
  id: string;
  /** 製品マスタ突合済みの内部 id（文字列化）。null = 製品未特定。 */
  productId: string | null;
  /** 名称 + 製品コード（表・ピッカーの表示用）。 */
  productLabel: string | null;
  /**
   * 製品名だけ（コードなし）。ヘッダの要約のように**並べて読む**場所で使う
   * — コードまで付くと 1 行に収まらない。
   */
  productName: string | null;
  /** 抽出された品名（生テキスト）。 */
  productText: string | null;
  /**
   * 製品を 1 件に絞れなかったときの候補（lib/product-match）。
   * 編集画面の製品欄の下に「もしかして」として出す。突合済みなら空配列。
   */
  productSuggestions: MatchSuggestion[];
  orderType: string;
  quantity: number;
  unitPrice: number | null;
  deliveryDate: string | null; // yyyy-mm-dd
  notes: string | null;
}

/**
 * 突合の候補 1 件（AI が読み取った文字列に近いマスタ）。
 * 顧客（lib/bp-match）・製品（lib/product-match）で同じ形。
 */
export interface MatchSuggestion {
  id: string;
  label: string;
  /** 当たった登録側の表記（なぜこれが候補なのかを画面に出す）。 */
  matchedKey: string;
}

/** 詳細 view。 */
export interface OrderAcceptanceView {
  /**
   * 項目ごとの突合レビュー（lib/intake-review）。AI が何を読み取り、
   * どれがマスタに引けなかったかを画面に出すためのもの。手入力は空配列。
   */
  review: FieldReview[];
  number: string;
  yearMonth: string;
  seq: number;
  status: OrderAcceptanceStatus;
  source: IntakeSource;
  sourceFilename: string | null;
  /** 取込元の MIME（インライン表示の出し分け用）。 */
  sourceMimeType: string | null;
  extractError: string | null;
  customerBpId: string | null;
  customerName: string | null;
  customerBranchName: string | null;
  /**
   * 顧客を 1 件に絞れなかったときの候補（lib/bp-match）。編集画面の顧客欄に
   * 「もしかして」として出し、1 クリックで選べるようにする。
   * 顧客が決まっている / 候補も無い場合は空配列。
   */
  customerSuggestions: MatchSuggestion[];
  customerOrderRef: string | null;
  /** 営業担当（作成時に顧客の主担当を複写したスナップショット）。 */
  salesRepId: string | null;
  salesRepName: string | null;
  /** 作成者（app.users.display_name）。 */
  createdByName: string | null;
  quoteNumber: string | null;
  orderDate: string | null; // yyyy-mm-dd
  notes: string | null;
  items: OrderAcceptanceItemView[];
  /** 注文確定で生成された注文明細番号（ORD-…-NN、枝番順）。 */
  orderLineNumbers: string[];
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 取込元ファイルの配信 URL（inline 表示）。 */
export function sourceFileUrl(view: {
  yearMonth: string;
  seq: number;
}): string {
  return `/api/intake/source/${view.yearMonth}/${view.seq}`;
}
