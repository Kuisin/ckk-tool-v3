/**
 * model.ts — 手動入出庫 (ST06) の view-model types + pure ヘルパ。
 *
 * 判定そのもの（どちら側が要るか・検査・計上順）は lib/movement-type-core.ts が
 * 唯一の定義元。ここは画面が必要とする「取得済みの選択肢」の形と、選択肢からの
 * 組み立てだけを持つ（pure / client-safe）。
 */

import type { MovementDirection } from "@/lib/movement-type-core";

/** 移動タイプ 1 件（Select の選択肢 + 判定に要る列）。 */
export interface MovementTypeOption {
  id: number;
  code: string;
  /** 表示ラベル（現ロケール解決済み）。 */
  name: string;
  direction: MovementDirection;
  requiresFrom: boolean;
  requiresTo: boolean;
}

/** 棚 1 件。 */
export interface EndpointShelfOption {
  id: number;
  label: string;
}

/** 保管場所 1 件（配下の棚を持つ）。 */
export interface EndpointStorageLocationOption {
  id: number;
  label: string;
  shelves: EndpointShelfOption[];
}

/** 拠点 1 件（配下の保管場所を持つ）。出庫元・入庫先の両方で共有する。 */
export interface EndpointPlantOption {
  id: number;
  label: string;
  locations: EndpointStorageLocationOption[];
}

/** 移動タイプ Select の 1 行ラベル（`番号 — 名称`）。 */
export function movementTypeOptionLabel(t: MovementTypeOption): string {
  return `${t.code} — ${t.name}`;
}

/** id から移動タイプを引く（無ければ null）。 */
export function findMovementType(
  types: MovementTypeOption[],
  id: number | null,
): MovementTypeOption | null {
  if (id == null) return null;
  return types.find((t) => t.id === id) ?? null;
}

/** id から拠点を引く。 */
export function findPlant(
  plants: EndpointPlantOption[],
  plantId: number | null,
): EndpointPlantOption | null {
  if (plantId == null) return null;
  return plants.find((p) => p.id === plantId) ?? null;
}

/** 拠点内から保管場所を引く。 */
export function findLocation(
  plant: EndpointPlantOption | null,
  locationId: number | null,
): EndpointStorageLocationOption | null {
  if (!plant || locationId == null) return null;
  return plant.locations.find((l) => l.id === locationId) ?? null;
}

/**
 * SearchSelect の value（`<PRODUCT|MATERIAL>:<id>`）を分解する。
 * 壊れた値（旧形式・想定外の入力）は null を返す。
 */
export function parseItemOptionValue(
  value: string | null,
): { itemType: "PRODUCT" | "MATERIAL"; itemId: number } | null {
  if (!value) return null;
  const i = value.indexOf(":");
  if (i < 0) return null;
  const kind = value.slice(0, i);
  const idPart = value.slice(i + 1);
  if (kind !== "PRODUCT" && kind !== "MATERIAL") return null;
  const itemId = Number(idPart);
  if (!Number.isInteger(itemId) || itemId <= 0) return null;
  return { itemType: kind, itemId };
}
