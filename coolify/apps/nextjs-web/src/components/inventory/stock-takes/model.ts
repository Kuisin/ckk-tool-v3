/**
 * model.ts — 棚卸 (PD08) の表示用型 + 判定ロジックの client-safe な再輸出。
 *
 * 判定そのものは `lib/stock-take-core.ts`（純ロジック・試験あり）が唯一の
 * 定義元。ここで数え直さない — 差異の計算・編集可否・提出可否・キャンセル
 * 可否は必ずそちらを通す。
 */

export {
  canCancel,
  canEditCounts,
  canSubmit,
  countedLines,
  differenceCount,
  differenceTotals,
  type StockTakeApprovalStatus,
  type StockTakeLineInput,
  type StockTakeState,
  type StockTakeStatus,
  shouldPost,
  stockTakeDifference,
} from "@/lib/stock-take-core";

export type InventoryType = "PRODUCT" | "MATERIAL";

/** 一覧 1 行分。 */
export interface StockTakeRow {
  stockTakeNumber: string;
  plantName: string;
  storageLocationName: string | null;
  status: "DRAFT" | "COUNTING" | "CONFIRMED" | "CANCELLED";
  approvalStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  lineCount: number;
  createdByName: string | null;
  updatedAt: string;
}

/** 棚卸対象バケット 1 行（=1 在庫バケット）の表示形。 */
export interface StockTakeLineView {
  id: string;
  inventoryType: InventoryType;
  /** 製品名 / 素材名。 */
  itemName: string;
  /** 製品コード / 素材コード（引けなければ null）。 */
  itemCode: string | null;
  /** 「保管場所 / 棚」。未割当は null。 */
  storageLabel: string | null;
  /** 製品のみ（半製品含む）。素材は常に null。 */
  lotNumber: number | null;
  bookQuantity: number;
  countedQuantity: number | null;
  notes: string | null;
}

/** 詳細画面が必要とするものすべて。 */
export interface StockTakeView {
  stockTakeNumber: string;
  plantId: number;
  plantName: string;
  storageLocationId: number | null;
  storageLocationName: string | null;
  status: "DRAFT" | "COUNTING" | "CONFIRMED" | "CANCELLED";
  approvalStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  countedAt: string | null;
  requestedAt: string | null;
  requestedByName: string | null;
  rejectedAt: string | null;
  rejectedByName: string | null;
  rejectReason: string | null;
  confirmedAt: string | null;
  confirmedByName: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  /** 確定時に発行した入出庫伝票の表示番号（MOV-…）。差異ゼロ確定なら null。 */
  movementNumber: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  lines: StockTakeLineView[];
}

/** stock-take-core の判定へ渡す形へ落とす（liveQuantity は確定処理だけが持つ）。 */
export function lineInputsOf(
  lines: readonly StockTakeLineView[],
): { bookQuantity: number; countedQuantity: number | null }[] {
  return lines.map((l) => ({
    bookQuantity: l.bookQuantity,
    countedQuantity: l.countedQuantity,
  }));
}
