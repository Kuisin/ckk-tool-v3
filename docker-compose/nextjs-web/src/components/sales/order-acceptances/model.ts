/**
 * model.ts — 受注請書 intake (SA03) の client-safe view model と表示定数。
 *
 * ライフサイクル: IMPORT（取込・抽出中/失敗）→ DRAFT（抽出済・編集可）→
 * REQUESTED（承認依頼）→ APPROVED → COMPLETED（伝票展開済）→ ARCHIVED。
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
  productLabel: string | null;
  /** 抽出された品名（生テキスト）。 */
  productText: string | null;
  orderType: string;
  quantity: number;
  unitPrice: number | null;
  deliveryDate: string | null; // yyyy-mm-dd
  notes: string | null;
}

/** 詳細 view。 */
export interface OrderAcceptanceView {
  number: string;
  yearMonth: string;
  seq: number;
  status: OrderAcceptanceStatus;
  source: IntakeSource;
  sourceFilename: string | null;
  extractError: string | null;
  customerBpId: string | null;
  customerName: string | null;
  customerBranchName: string | null;
  customerOrderRef: string | null;
  quoteNumber: string | null;
  orderDate: string | null; // yyyy-mm-dd
  notes: string | null;
  items: OrderAcceptanceItemView[];
  /** 伝票展開で生成された注文請書番号（ORD-…-NN、枝番順）。 */
  salesOrderNumbers: string[];
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
