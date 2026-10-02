/**
 * model.ts — 素材在庫 (PD05) view-model types。pure / client-safe のみ。
 *
 * id = material_inventory.id (uuid) — URL id と同一。
 * Decimal 列（数量・予約数量・ATP）はサーバー境界で Number() 済み。
 */

import type { InventoryTransactionRow } from "../model";

/** 素材在庫 一覧 1 行。 */
export interface MaterialInventoryRow {
  id: string;
  materialCode: string;
  materialName: string;
  plantId: number | null;
  plantName: string | null;
  /** 保管場所（null = 未割当）。 */
  storageLocationId: number | null;
  storageLocationName: string | null;
  /** 棚（null = 場所内未割当）。 */
  shelfId: number | null;
  shelfCode: string | null;
  quantity: number;
  reservedQuantity: number;
  /** 利用可能数 = quantity − reservedQuantity。 */
  available: number;
  unit: string;
  /** 次回入荷予定日（ORDERED 発注の直近 expected_at。未定・なしは null）。 */
  nextReceiptDate: string | null;
  updatedAt: string;
}

/** ATP タイムライン 1 行（lib/atp-core AtpPoint と同形）。 */
export interface AtpTimelinePoint {
  /** null = 現時点、"9999-12-31" = 入荷日未定マーカー。 */
  date: string | null;
  /** その日の入荷量（現時点行は 0）。 */
  delta: number;
  /** 累積 available。 */
  available: number;
  /** 参照発注番号（PO-…）。 */
  refs: string[];
}

/** 素材在庫 詳細。 */
export interface MaterialInventoryDetailData {
  id: string;
  materialCode: string;
  materialName: string;
  plantName: string | null;
  quantity: number;
  reservedQuantity: number;
  available: number;
  unit: string;
  /** 保管場所 / 棚 の表示ラベル（未割当は null — 旧 location を後段で併記）。 */
  storageLabel: string | null;
  location: string | null;
  notes: string | null;
  updatedAt: string;
  /** ATP（この在庫行の拠点で絞り込み。拠点未設定行は全拠点合算）。 */
  atp: {
    onHand: number;
    reserved: number;
    availableNow: number;
    nextReceiptDate: string | null;
    timeline: AtpTimelinePoint[];
  };
  transactions: InventoryTransactionRow[];
}
