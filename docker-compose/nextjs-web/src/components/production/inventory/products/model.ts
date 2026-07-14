/**
 * model.ts — 製品在庫 (PD04) view-model types。pure / client-safe のみ。
 *
 * id = product_inventory.id (uuid) — URL id と同一。
 * 仕掛品（WIP）は在庫レコードではなく、進行中指示書の工程数量から
 * サーバー側で都度算出する（computeWipByStep）。
 */

import type {
  InventoryReservationRow,
  InventoryTransactionRow,
} from "../model";

/** 製品在庫 一覧 1 行。 */
export interface ProductInventoryRow {
  id: string;
  productName: string;
  /** 製品コード（PRD-… 導出。レガシーは未採番 → null）。 */
  productCode: string | null;
  factoryName: string | null;
  /** ロット番号 = 指示書番号。 */
  lotNumber: number | null;
  quantity: number;
  reservedQuantity: number;
  /** 利用可能数 = quantity − reservedQuantity。 */
  available: number;
  /** 半製品フラグ（区分列: 半製品 orange バッジ）。 */
  isSemiFinished: boolean;
  updatedAt: string;
}

/** 仕掛品 一覧 1 行（進行中指示書の工程別仕掛数）。 */
export interface WipRow {
  /** work_order_steps.id — 行キー。 */
  stepId: string;
  productName: string;
  productCode: string | null;
  workOrderNumber: number;
  stepName: string;
  wip: number;
}

/** 製品在庫 詳細。 */
export interface ProductInventoryDetailData {
  id: string;
  productName: string;
  productCode: string | null;
  factoryName: string | null;
  lotNumber: number | null;
  quantity: number;
  reservedQuantity: number;
  available: number;
  isSemiFinished: boolean;
  location: string | null;
  /** 半製品の発生工程（指示書 #N / 工程名）。sourceStepId がある場合のみ。 */
  sourceStepLabel: string | null;
  notes: string | null;
  updatedAt: string;
  reservations: InventoryReservationRow[];
  transactions: InventoryTransactionRow[];
}
