/**
 * f4-presets.ts — SearchSelect の F4（詳細検索ポップアップ）標準設定。
 *
 * フィルタ定義・結果列と、_shared/option-search.ts のサーバー検索を束ねる。
 * 画面側は `f4={PRODUCT_F4}` を渡すだけでよい（ui/SearchSelect.tsx）。
 */

import {
  f4SearchCustomers,
  f4SearchProducts,
  f4SearchStructuredMaterialTypes,
} from "@/app/(dashboard)/_shared/option-search";
import type { Option } from "@/lib/mock";
import type { F4Config } from "./F4SearchModal";

export const PRODUCT_F4: F4Config = {
  title: "製品の詳細検索",
  description:
    "名称・使用素材で絞り込んで選択します（レガシー製品はコード未採番）。",
  filters: [
    { key: "name", label: "名称" },
    { key: "material", label: "素材コード" },
  ],
  columns: ["製品コード", "名称", "素材", "単位"],
  onSearch: f4SearchProducts,
};

export const CUSTOMER_F4: F4Config = {
  title: "顧客の詳細検索",
  description: "BPコード・名称（かな・AI照合名を含む）で絞り込みます。",
  filters: [
    { key: "code", label: "BPコード", placeholder: "例: BP-" },
    { key: "name", label: "名称・かな" },
  ],
  columns: ["BPコード", "名称", "かな"],
  onSearch: f4SearchCustomers,
};

/** 変換済材種の F4 — メーカー / 形状は呼び出し画面が options を渡す。 */
export function materialTypeF4(
  manufacturerOptions: Option[],
  shapeOptions: Option[],
): F4Config {
  return {
    title: "材種の詳細検索",
    description: "変換済（コード構成あり）の材種のみが対象です。",
    filters: [
      {
        key: "manufacturerCode",
        label: "メーカー",
        type: "select",
        options: manufacturerOptions,
      },
      {
        key: "shapeCode",
        label: "形状",
        type: "select",
        options: shapeOptions,
      },
      { key: "code", label: "材種コード" },
      { key: "name", label: "名称" },
    ],
    columns: ["材種コード", "メーカー", "形状", "名称"],
    onSearch: f4SearchStructuredMaterialTypes,
  };
}
