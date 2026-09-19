/**
 * model.ts — 入出庫伝票 (PD07) view-model types + pure ラベル定義。
 *
 * Model (app.inventory_movements — uuid PK, 表示番号は (year_month, seq) から
 * 導出。明細は app.inventory_transactions の movement_id 逆参照):
 *   在庫が動いた出来事 1 回 = 1 枚。読み取り専用（作る画面は無い — 伝票は
 *   在庫を動かした処理が自分で起こすもので、人が手で起こすものではない）。
 *
 * Decimal 列（明細の quantity）はサーバー境界で Number() 済み。
 * ここは pure / client-safe のみ。
 */

/** 一覧 (PD07) の1行。 */
export interface MovementRow {
  /** 導出文書番号（MOV-YYYYMM-NNNNN）。URL id にも使う。 */
  id: string;
  movementNumber: string;
  /** WORK_ORDER_COMPLETION / DELIVERY_SHIPMENT / MATERIAL_RECEIPT / … */
  cause: string;
  plantId: number | null;
  /** 主たる拠点（拠点をまたぐ移動では null）。 */
  plantName: string | null;
  /** 元になった書類のテーブル名（audit_logs と同じ多態規約）。 */
  sourceType: string | null;
  /** 元書類の業務キー。 */
  sourceId: string | null;
  lineCount: number;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
}

/** 明細 1 行（入出庫伝票の取引行 = inventory_transactions）。 */
export interface MovementLineRow {
  id: string;
  /** IN / OUT / RESERVE / RELEASE / ADJUST。 */
  transactionType: string;
  /** PRODUCT / MATERIAL。 */
  inventoryType: string;
  /** 製品名・素材名（在庫バケットが既に消えている場合は「—」）。 */
  itemName: string;
  /** ロット番号（製品在庫のみ。素材・ロット無しは null）。 */
  lotNumber: number | null;
  /** 保管場所 / 棚（例: 第一倉庫 / A-1。未割当は null）。 */
  locationLabel: string | null;
  quantity: number;
  unit: string;
  notes: string | null;
}

/** 詳細 (PD27) = 一覧行 + 明細。 */
export interface MovementDetail extends MovementRow {
  lines: MovementLineRow[];
}

/** 事由 → バッジ色。ラベルは lib/enum-labels.ts movementCauseLabel()（i18n）。 */
export const MOVEMENT_CAUSE_COLOR: Record<string, string> = {
  WORK_ORDER_COMPLETION: "violet",
  DELIVERY_SHIPMENT: "orange",
  MATERIAL_RECEIPT: "teal",
  STOCK_TRANSFER: "blue",
  STOCK_RESERVATION: "yellow",
  RESERVATION_RELEASE: "gray",
  ADJUSTMENT: "grape",
  OTHER: "gray",
};
