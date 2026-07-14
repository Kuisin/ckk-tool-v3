/**
 * model.ts — 素材入荷 (PU01) view-model types。
 *
 * Model (app.material_receipts — uuid PK):
 *   入荷は「発注明細の入荷」（purchaseOrderItemId あり — 素材発注書の入荷完了
 *   で自動作成）と「直接調達の入荷」（purchaseOrderItemId なし — PU01 で手動
 *   登録）の2系統。どちらも onMaterialReceipt で素材在庫へ入庫済み。
 *
 * Decimal 列（quantity）はサーバー境界で Number() 済み。pure / client-safe のみ。
 */

/** 一覧 (PU01) の1行 = 詳細 view model（項目数が少ないため共用）。 */
export interface MaterialReceiptView {
  id: string;
  /** 素材の内部 id（連番）を文字列で保持。 */
  materialId: string;
  materialCode: string;
  materialName: string;
  supplierName: string | null;
  factoryName: string | null;
  quantity: number;
  unit: string;
  receivedAt: string;
  /** 紐付く素材発注書番号（発注入荷のみ。直接調達は null）。 */
  poNumber: string | null;
  notes: string | null;
  createdAt: string;
}
