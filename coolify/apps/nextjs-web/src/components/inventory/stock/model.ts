/**
 * model.ts — 在庫一覧 (ST02) view-model types + pure ラベル定義。
 *
 * Model (app.item_inventory — 製品在庫・素材在庫を統合した鏡テーブル。
 * shared-db/prisma/schema/inventory.prisma 参照):
 *   「この拠点・この棚に何があるか」を **場所起点** で答える読み取り専用の一覧。
 *   品目 1 つを時系列で追う 在庫・所要量 (ST03) とは見る向きが逆の別アプリ
 *   — ここから ST03 への遷移リンクは作らない（design.md 冒頭の Purpose 参照）。
 *
 * Decimal 列（quantity / reservedQuantity）はサーバー境界で Number() 済み。
 * ここは pure / client-safe のみ。
 */

/** 一覧 (ST02) の1行 = item_inventory の1バケット。 */
export interface StockOverviewRow {
  /** item_inventory.id（uuid）。 */
  id: string;
  itemId: number;
  /** PRODUCT / MATERIAL。 */
  itemType: string;
  itemName: string;
  /** 表示コード（製品コード・素材コード）。移行前の未採番行は null。 */
  itemCode: string | null;
  plantId: number | null;
  /** 拠点名（未割当バケットは null）。 */
  plantName: string | null;
  storageLocationId: number | null;
  storageLocationName: string | null;
  shelfId: number | null;
  shelfCode: string | null;
  /** ロット = 指示書番号（製品のみ。素材は常に null）。 */
  lotNumber: number | null;
  quantity: number;
  reservedQuantity: number;
  /** = quantity − reservedQuantity。 */
  available: number;
  unit: string;
  updatedAt: string;
}

/** 品目種別 → バッジ色（_specs/design.md §1.1 カテゴリ色に寄せる: 製品=blue, 素材=teal）。 */
export const ITEM_TYPE_COLOR: Record<string, string> = {
  PRODUCT: "blue",
  MATERIAL: "teal",
};
