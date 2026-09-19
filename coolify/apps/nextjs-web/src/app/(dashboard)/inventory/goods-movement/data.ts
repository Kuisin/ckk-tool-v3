/**
 * data.ts — 手動入出庫 (ST06) 画面が起動時に読む選択肢。
 *
 * 品目は件数が多い（製品だけで数万件）ため一覧では配らず、
 * `_shared/option-search.ts` の `searchItemOptions`（SearchSelect 経由）で
 * 都度検索する。ここで先読みするのは 移動タイプ（数十件）と
 * 拠点 → 保管場所 → 棚（数百件規模）だけ。
 */

import type {
  EndpointPlantOption,
  MovementTypeOption,
} from "@/components/inventory/goods-movement/model";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";

/** 有効な移動タイプ（表示順）。 */
export async function fetchMovementTypeOptions(): Promise<
  MovementTypeOption[]
> {
  const rows = await prisma.movementType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: localized(r.name as LocalizedText | null),
    direction: r.direction,
    requiresFrom: r.requiresFrom,
    requiresTo: r.requiresTo,
  }));
}

/** 有効な 拠点 → 保管場所 → 棚（出庫元・入庫先の両方で共有する）。 */
export async function fetchEndpointPlantOptions(): Promise<
  EndpointPlantOption[]
> {
  const plants = await prisma.plant.findMany({
    where: { isActive: true },
    include: {
      storageLocations: {
        where: { isActive: true },
        include: {
          shelves: {
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      },
    },
    orderBy: { code: "asc" },
  });
  return plants.map((p) => ({
    id: p.id,
    label: `${localized(p.name as LocalizedText | null)}（${p.code}）`,
    locations: p.storageLocations.map((l) => ({
      id: l.id,
      label: `${localized(l.name as LocalizedText | null)}（${l.code}）`,
      shelves: l.shelves.map((s) => {
        const name = s.name as LocalizedText | null;
        return {
          id: s.id,
          label: name?.ja ? `${s.code}（${name.ja}）` : s.code,
        };
      }),
    })),
  }));
}
