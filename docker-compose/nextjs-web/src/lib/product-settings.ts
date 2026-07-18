import "server-only";

/**
 * product-settings.ts — 製品種別（SY04）の型付きアダプタ。
 *
 * app.system_settings の名前空間 `product_type`（キー `product_type.types`）に
 * ProductType[] を JSON 保存する（app-config.ts 経由）。未設定・不正時は
 * DEFAULT_PRODUCT_TYPES を返す。
 */

import { readConfigNamespace, writeConfigValues } from "./app-config";
import {
  DEFAULT_PRODUCT_TYPES,
  type ProductType,
  productTypesArraySchema,
} from "./product-types";

const NAMESPACE = "product_type";
const TYPES_KEY = "product_type.types";

/** 製品種別の一覧。未設定/不正なら既定値。 */
export async function getProductTypes(): Promise<ProductType[]> {
  const byKey = await readConfigNamespace(NAMESPACE);
  const raw = byKey.get(TYPES_KEY);
  if (raw === undefined || raw === null) return DEFAULT_PRODUCT_TYPES;
  const parsed = productTypesArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_PRODUCT_TYPES;
}

/** 有効な種別のみ（順序付き）。フォームの選択肢に使う。 */
export async function getEnabledProductTypes(): Promise<ProductType[]> {
  const all = await getProductTypes();
  return all
    .filter((t) => t.enabled)
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      ...t,
      items: [...t.items].sort((a, b) => a.order - b.order),
    }));
}

/** 製品種別を保存（Server Action から呼ぶ）。 */
export async function saveProductTypes(types: ProductType[]): Promise<void> {
  await writeConfigValues({ [TYPES_KEY]: types });
}
