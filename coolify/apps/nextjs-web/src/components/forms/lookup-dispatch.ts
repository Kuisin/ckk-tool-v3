/**
 * lookup-dispatch.ts — 業務データ検索項目（lookup）の参照先 → 検索アクション。
 *
 * **このファイルに `"use server"` を付けてはいけない。** `"use server"` の
 * モジュールは async 関数しか export できず、こういう「値のマップ」を置くと
 * クライアントが受け取るのは Server Action の参照になり、使った瞬間に壊れる
 * （scripts/check-use-server-exports.sh が CI で落とす）。ここは普通の
 * モジュールで、中で Server Action を import して束ねるだけ。
 */

import {
  searchCustomerOptions,
  searchMaterialItemOptions,
  searchMaterialTypeOptions,
  searchPlantOptions,
  searchProcessStepOptions,
  searchProductItemOptions,
  searchShipToOptions,
  searchStorageLocationOptions,
  searchUserOptions,
  searchWorkLocationOptions,
} from "@/app/(dashboard)/_shared/option-search";
import type { LookupSource } from "@/lib/form-schema";
import type { RecentOption } from "@/lib/recents";

type Searcher = (query: string) => Promise<RecentOption[]>;

const SEARCHERS: Record<LookupSource, Searcher> = {
  user: searchUserOptions,
  customer: searchCustomerOptions,
  // 支店・工場も含めて引く（顧客の◯◯工場 を選ぶため）。
  business_partner: searchShipToOptions,
  // 品目統合 第 3 段 — 製品・素材はどちらも **items.id** を値にする。
  // 保存済みの回答が持っていた旧 id は migration
  // (20261101090000_items_stage3_matching_forms) で書き換え済み。
  product: searchProductItemOptions,
  material: searchMaterialItemOptions,
  material_type: searchMaterialTypeOptions,
  process_step: searchProcessStepOptions,
  plant: searchPlantOptions,
  storage_location: searchStorageLocationOptions,
  work_location: searchWorkLocationOptions,
};

export function searcherFor(source: LookupSource): Searcher {
  return SEARCHERS[source] ?? (async () => []);
}

/** SearchSelect の「最近使用」を参照先ごとに分ける（製品と拠点が混ざらない）。 */
export function recentsKeyFor(source: LookupSource): string {
  return `form-lookup:${source}`;
}
