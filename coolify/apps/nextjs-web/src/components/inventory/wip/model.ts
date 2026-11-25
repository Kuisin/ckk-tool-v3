/**
 * model.ts — 在庫管理の「仕掛品」タブの view-model。pure / client-safe のみ。
 *
 * 仕掛品 = 途中まで加工して在庫に置いた品。品目は仕掛ブランク（材種 × 径 × 長）で、
 * どこまで加工したか（加工状態）・仕上がり寸法・目標製品は在庫の行が持つ
 * （_specs/tables.md の在庫節 / lib/wip-state-core.ts）。
 *
 * 進行中の指示書に乗っている本数（工程内）は在庫ではないので、ここには無い —
 * そちらは products/model.ts の WipRow（「工程内」タブ）。
 */

/** 仕掛品 一覧 1 行 = 在庫バケット 1 つ（id = item_inventory.id）。 */
export interface WipStockRow {
  id: string;
  /** 在庫の品目（仕掛ブランク。未分類は製品のまま）。 */
  itemId: number;
  itemCode: string | null;
  itemName: string;
  /** 仕掛ブランクの材種・径・長。未分類は null。 */
  materialTypeId: number | null;
  materialTypeLabel: string | null;
  diameterMm: number | null;
  lengthMm: number | null;
  /** 加工状態（wip_states）。 */
  wipStateId: number;
  /** 呼び名（任意）。無ければ工程名を並べて見せる。 */
  stateName: string | null;
  /** 呼び名の多言語 JSON そのまま（名前を付けるモーダルの初期値）。 */
  stateNameJson: Record<string, string> | null;
  /** 済んだ形を変える工程（カタログ id、早い順）。 */
  stepIds: number[];
  stepNames: string[];
  /** 「未分類」（移行で行き先を推定できなかった旧来の半製品）。 */
  isLegacy: boolean;
  /** 研削後の仕上がり寸法。 */
  finishedDiameterMm: number | null;
  finishedLengthMm: number | null;
  quantity: number;
  reservedQuantity: number;
  /** 利用可能数 = quantity − reservedQuantity。 */
  available: number;
  unit: string;
  plantId: number | null;
  plantName: string | null;
  storageLocationId: number | null;
  storageLocationName: string | null;
  shelfId: number | null;
  shelfCode: string | null;
  /** ロット番号 = 指示書番号。 */
  lotNumber: number | null;
  /** 目標製品（この仕掛品が何を作る途中だったか）。 */
  aimedItemId: number | null;
  aimedProductName: string | null;
  aimedProductCode: string | null;
  /** 発生工程（指示書 #N と工程名）。発生元が分からなければ null。 */
  sourceWorkOrderNumber: number | null;
  sourceStepName: string | null;
  /** 在庫に入った時刻（ISO）。発生工程の完了 → 最初の入庫 → 更新日の順で決める。 */
  receivedAt: string | null;
  /** 経過日数（サーバーで数えた値 — ブラウザの時計と TZ に依らない）。 */
  ageDays: number | null;
  /**
   * 「分類する」の初期値 — 目標製品が要求する素材（材種・径・長）。
   * 未分類の行だけが持つ。
   */
  suggestion: {
    materialTypeId: number | null;
    materialTypeLabel: string | null;
    diameterMm: number | null;
    lengthMm: number | null;
  } | null;
}

/** 製品 1 つに使える仕掛品（製品タブの「使える仕掛品 n 本」）。 */
export interface UsableWipForProduct {
  /** 製品（items.id）。 */
  itemId: number;
  label: string;
  quantity: number;
  inventoryIds: string[];
}

/** 加工状態に数える工程（「分類する」で選ぶ並びの候補）。 */
export interface WipStepOption {
  id: number;
  name: string;
}

export interface WipStockData {
  rows: WipStockRow[];
  /** 製品（items.id）→ 使える仕掛品。0 本の製品は載らない。 */
  usableByProduct: Record<number, UsableWipForProduct>;
  stepOptions: WipStepOption[];
  /** 在庫を調整できるか（名前を付ける・分類する を出すか）。 */
  canAdjust: boolean;
}
