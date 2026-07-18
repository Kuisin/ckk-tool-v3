import "server-only";

/**
 * product-settings.ts — 製品項目（SY04）の型付きアダプタ。
 *
 * app.system_settings の名前空間 `product_item` に保存:
 *   - `product_item.definitions` … ProductItemDef[]（項目ライブラリ）
 *   - `product_item.types`       … ProductType[]（種別 = 項目の割り当て）
 * 未設定・不正時は既定値を返す。
 */

import { readConfigNamespace, writeConfigValues } from "./app-config";
import {
  DEFAULT_PRODUCT_ITEM_DEFS,
  DEFAULT_PRODUCT_TYPES,
  type ProductItemDef,
  type ProductType,
  productItemDefsArraySchema,
  productTypesArraySchema,
  type ResolvedProductType,
  resolveProductType,
} from "./product-types";

const NAMESPACE = "product_item";
const DEFS_KEY = "product_item.definitions";
const TYPES_KEY = "product_item.types";

async function readNs() {
  return readConfigNamespace(NAMESPACE);
}

/** 項目定義の一覧。未設定/不正なら既定値。 */
export async function getProductItemDefs(): Promise<ProductItemDef[]> {
  const raw = (await readNs()).get(DEFS_KEY);
  if (raw === undefined || raw === null) return DEFAULT_PRODUCT_ITEM_DEFS;
  const parsed = productItemDefsArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_PRODUCT_ITEM_DEFS;
}

/** 製品種別（生の割り当て）の一覧。未設定/不正なら既定値。 */
export async function getProductTypes(): Promise<ProductType[]> {
  const raw = (await readNs()).get(TYPES_KEY);
  if (raw === undefined || raw === null) return DEFAULT_PRODUCT_TYPES;
  const parsed = productTypesArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_PRODUCT_TYPES;
}

/** 定義と種別を 1 度に読む（両方を結合するページ向け）。 */
export async function getProductItemSettings(): Promise<{
  defs: ProductItemDef[];
  types: ProductType[];
}> {
  const byKey = await readNs();
  const defsRaw = byKey.get(DEFS_KEY);
  const typesRaw = byKey.get(TYPES_KEY);
  const defs =
    defsRaw == null
      ? DEFAULT_PRODUCT_ITEM_DEFS
      : (productItemDefsArraySchema.safeParse(defsRaw).data ??
        DEFAULT_PRODUCT_ITEM_DEFS);
  const types =
    typesRaw == null
      ? DEFAULT_PRODUCT_TYPES
      : (productTypesArraySchema.safeParse(typesRaw).data ??
        DEFAULT_PRODUCT_TYPES);
  return { defs, types };
}

/** 種別を項目定義と結合した解決済み一覧（フォーム/検証用）。順序付き。 */
export async function getResolvedProductTypes(): Promise<
  ResolvedProductType[]
> {
  const { defs, types } = await getProductItemSettings();
  return [...types]
    .sort((a, b) => a.order - b.order)
    .map((t) => resolveProductType(t, defs));
}

/** 有効な種別のみ解決（製品作成の選択肢用）。 */
export async function getEnabledResolvedProductTypes(): Promise<
  ResolvedProductType[]
> {
  const { defs, types } = await getProductItemSettings();
  return [...types]
    .filter((t) => t.enabled)
    .sort((a, b) => a.order - b.order)
    .map((t) => resolveProductType(t, defs));
}

export async function saveProductItemDefs(
  defs: ProductItemDef[],
): Promise<void> {
  await writeConfigValues({ [DEFS_KEY]: defs });
}

export async function saveProductTypes(types: ProductType[]): Promise<void> {
  await writeConfigValues({ [TYPES_KEY]: types });
}
