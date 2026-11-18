/**
 * model.ts — 在庫・所要量 (ST03) の view-model types + pure ラベル定義。
 *
 * サーバー側 (`../../app/(dashboard)/inventory/requirements/data.ts`) が
 * `lib/stock-requirements-core.ts` の `buildStockRequirementsTimeline()` を
 * 呼んで組み立てた結果を、そのまま画面表示用の形に写したもの。
 *
 * Decimal はサーバー境界で Number() 済み。past 行の `note` は**未解決の
 * 構造化ノート文字列**のまま持つ — 表示側（RequirementsView, 'use client'）が
 * `inventoryNoteLabel(useTranslations() の tr, note)` でいま開いている人の
 * 言語に解決する（movements/MovementDetail.tsx と同じ規約。書いた瞬間の
 * 言語に固定しない）。
 */

export type StockRequirementRowKind = "past" | "now" | "supply" | "demand";

export interface StockRequirementRowView {
  key: string;
  kind: StockRequirementRowKind;
  /** past は ISO datetime、future は ISO date、now/未定は null。 */
  date: string | null;
  ref: string | null;
  refHref: string | null;
  /** past 行だけが持つ構造化ノート文字列（未解決）。 */
  note: string | null;
  quantity: number | null;
  balance: number;
}

export interface ItemSummary {
  id: number;
  itemType: "PRODUCT" | "MATERIAL";
  code: string | null;
  /** 表示済み名称（サーバー側 localized() 済み）。 */
  name: string;
  unit: string;
}

export interface PlantSummary {
  id: number;
  /** 表示済み名称（コード + localized 名）。 */
  name: string;
}

export interface StockRequirementsView {
  item: ItemSummary;
  plant: PlantSummary;
  onHand: number;
  reserved: number;
  availableNow: number;
  nextReceiptDate: string | null;
  rows: StockRequirementRowView[];
  /** 残高が初めて負になった行の key（無ければ null）。 */
  firstNegativeKey: string | null;
  /** 過去行が一覧取得の上限で切れているか（古い履歴がまだある）。 */
  truncated: boolean;
}

/**
 * 区分 → バッジ色。ラベルは `lib/enum-labels.ts` `stockRequirementRowKindLabel()`
 * / `itemTypeLabel()`（i18n。値付きラベルの置き場は enum-labels.ts に統一する
 * 約束 — model.ts に別口のラベル関数を持たない）。
 */
export const ROW_KIND_COLOR: Record<StockRequirementRowKind, string> = {
  past: "gray",
  now: "blue",
  supply: "teal",
  demand: "orange",
};
