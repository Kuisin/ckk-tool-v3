/**
 * model.ts — 設計依頼書 (SA04) view-model types + pure helpers.
 *
 * Model (app.design_requests — uuid PK):
 *   依頼番号 DSG-YYYYMM-NNNNN は nextDocumentNumber("DESIGN") で採番し
 *   request_number に保存する（URL id も依頼番号）。
 *   トリガ: 見積時（QUOTE — 見積書 複合キー参照）/ 受注時（SALES_ORDER —
 *   注文請書 uuid 参照）。トリガと参照元は作成後変更不可。
 *
 * ここは pure / client-safe のみ。
 */

export type DesignRequestStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type DesignRequestTrigger = "QUOTE" | "SALES_ORDER";

/** トリガーバッジの色（QUOTE=blue 見積時 / SALES_ORDER=violet 受注時）。 */
export const DESIGN_TRIGGER_COLOR: Record<DesignRequestTrigger, string> = {
  QUOTE: "blue",
  SALES_ORDER: "violet",
};

/** ファイルタブの1行（design_files + files の抜粋）。 */
export interface DesignRequestFile {
  id: string;
  version: number;
  isLatest: boolean;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  notes: string | null;
  createdAt: string;
}

export interface DesignRequest {
  /** URL id = 依頼番号 DSG-YYYYMM-NNNNN（request_number に保存済み）。 */
  id: string;
  requestNumber: string;
  /** DB uuid — 内部参照用。 */
  uuid: string;
  trigger: DesignRequestTrigger;
  /** 見積時: 見積元の見積書番号 QOT-…（導出）。受注時・未設定は null。 */
  quoteNumber: string | null;
  /** 受注時: 参照する注文請書の uuid / 導出番号 ORD-…-NN。 */
  salesOrderId: string | null;
  salesOrderNumber: string | null;
  /** 製品の内部 id（連番）を文字列で保持 — SearchSelect の値と揃える。 */
  productId: string | null;
  productName: string | null;
  /** 依頼内容。 */
  description: string | null;
  status: DesignRequestStatus;
  completedAt: string | null;
  files: DesignRequestFile[];
  createdAt: string;
  updatedAt: string;
}

/** 編集可能か — 完了前（未着手・進行中）のみ。 */
export function isEditable(r: Pick<DesignRequest, "status">) {
  return r.status === "PENDING" || r.status === "IN_PROGRESS";
}
