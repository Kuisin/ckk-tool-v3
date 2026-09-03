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
  | "ARCHIVED"
  | "CANCELLED";

export type IntakeSource = "FOLDER" | "UPLOAD" | "MANUAL";

/**
 * 逆リンク 1 行 — 見積書詳細の「次の書類へ」に出す注文請書の要約。
 * 取得は app/(dashboard)/sales/order-acceptances/data.ts の
 * fetchOrderAcceptancesForQuote。
 */
export interface AcceptanceLink {
  /** 表示番号 ORD-YYYYMM-NNNNN（URL id も同じ）。 */
  number: string;
  status: OrderAcceptanceStatus;
  /** ぶら下がる注文明細の件数（確定前は下書き行の数）。 */
  orderLineCount: number;
  updatedAt: string;
}

/**
 * 取込元 → バッジ表示（ラベル + 色）。
 * ラベルは訳が要るため、呼び出し側の `tr` を受け取って組み立てる。
 */
export function intakeSourceBadge(
  tr: (key: string) => string,
): Record<IntakeSource, { label: string; color: string }> {
  return {
    FOLDER: {
      label: tr("sales.orderAcceptances.watchedFolder"),
      color: "teal",
    },
    UPLOAD: {
      label: tr("sales.orderAcceptances.priorityIntake"),
      color: "blue",
    },
    MANUAL: { label: tr("sales.orderAcceptances.manualEntry"), color: "gray" },
  };
}

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
  /** 注文日（お客様が注文した日 — 抽出 or 手入力。null = 未入力）。 */
  orderDate: string | null;
  extractError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 明細 1 行（詳細）。 */
export interface OrderAcceptanceItemView {
  id: string;
  /**
   * 注文明細番号 ORD-YYYYMM-NNNNN-NN（確定時に枝番を採番して生まれる導出番号）。
   * 未確定（branch なし）の行は null — 明細表では番号なしで表示する。
   */
  lineNumber: string | null;
  /**
   * この明細に割り当てられた指示書（work_order_order_lines）。quantity は
   * その指示書がこの明細のために充当する数量（分割・統合の割当数）。
   */
  workOrders: OrderLineWorkOrderRef[];
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
  /**
   * 単価を価格表から外して人が決めた行か（§2 価格差異）。
   * false = 単価は価格表が持つ（保存時にサーバーが解決した値）。
   * 該当する価格表が無い行では意味を持たない（常に false）。
   */
  priceOverridden: boolean;
  deliveryDate: string | null; // yyyy-mm-dd
  notes: string | null;
}

/** 明細に割り当てられた指示書 1 件（表示用）。 */
export interface OrderLineWorkOrderRef {
  /** 指示書番号 = ロット番号（業務キー。詳細 URL にもこのまま使える）。 */
  workOrderNumber: number;
  /** この明細への割当数量。 */
  quantity: number;
  /** WORK_ORDER_STATUS。 */
  status: string;
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
  /** 出荷先（顧客と異なり得る取引先。任意）。 */
  shipToBpId: string | null;
  shipToName: string | null;
  /** 配送方法（通常配送 / ユーザー直送）。 */
  deliveryMethod: "NORMAL" | "DIRECT_TO_USER";
  /** エンドユーザー（最終需要家）— ユーザー直送では必須。 */
  endUserBpId: string | null;
  endUserName: string | null;
  /** 担当拠点（任意。id は Select 向けに文字列化）。 */
  assignedPlantId: string | null;
  assignedPlantName: string | null;
  /** 出荷作業場所（作業場所マスタ MS0D。任意。id は Select 向けに文字列化）。 */
  shippingWorkLocationId: string | null;
  shippingWorkLocationName: string | null;
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
