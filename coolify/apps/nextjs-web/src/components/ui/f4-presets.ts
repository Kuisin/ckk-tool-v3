/**
 * f4-presets.ts — SearchSelect の F4（詳細検索ポップアップ）標準設定。
 *
 * フィルタ定義・結果列と、_shared/option-search.ts のサーバー検索を束ねる。
 * 画面側は `f4={productF4(tr)}` のように呼び出し側の `tr` を渡すだけでよい
 * （ui/SearchSelect.tsx）。
 */

import type { useTranslations } from "next-intl";
import {
  f4SearchCustomers,
  f4SearchProducts,
  f4SearchStructuredMaterialTypes,
} from "@/app/(dashboard)/_shared/option-search";
import type { Option } from "@/lib/mock";
import type { F4Config } from "./F4SearchModal";

type Tr = ReturnType<typeof useTranslations>;

export function productF4(tr: Tr): F4Config {
  return {
    title: tr("ui.f4Presets.productTitle"),
    description: tr("ui.f4Presets.productDescription"),
    filters: [
      { key: "name", label: tr("ui.f4Presets.name") },
      { key: "materialType", label: tr("ui.f4Presets.materialTypeCode") },
    ],
    columns: [
      tr("ui.f4Presets.productCode"),
      tr("ui.f4Presets.name"),
      tr("ui.f4Presets.materialType"),
      tr("ui.f4Presets.unit"),
    ],
    onSearch: f4SearchProducts,
  };
}

export function customerF4(tr: Tr): F4Config {
  return {
    title: tr("ui.f4Presets.customerTitle"),
    description: tr("ui.f4Presets.customerDescription"),
    filters: [
      {
        key: "code",
        label: tr("ui.f4Presets.bpCode"),
        placeholder: tr("ui.f4Presets.bpCodePlaceholder"),
      },
      { key: "name", label: tr("ui.f4Presets.nameKana") },
    ],
    columns: [
      tr("ui.f4Presets.bpCode"),
      tr("ui.f4Presets.name"),
      tr("ui.f4Presets.kana"),
    ],
    onSearch: f4SearchCustomers,
  };
}

/** 変換済材種の F4 — メーカー / 形状は呼び出し画面が options を渡す。 */
export function materialTypeF4(
  tr: Tr,
  manufacturerOptions: Option[],
  shapeOptions: Option[],
): F4Config {
  return {
    title: tr("ui.f4Presets.materialTypeTitle"),
    description: tr("ui.f4Presets.materialTypeDescription"),
    filters: [
      {
        key: "manufacturerCode",
        label: tr("ui.f4Presets.manufacturer"),
        type: "select",
        options: manufacturerOptions,
      },
      {
        key: "shapeCode",
        label: tr("ui.f4Presets.shape"),
        type: "select",
        options: shapeOptions,
      },
      { key: "code", label: tr("ui.f4Presets.materialTypeCode") },
      { key: "name", label: tr("ui.f4Presets.name") },
    ],
    columns: [
      tr("ui.f4Presets.materialTypeCode"),
      tr("ui.f4Presets.manufacturer"),
      tr("ui.f4Presets.shape"),
      tr("ui.f4Presets.name"),
    ],
    onSearch: f4SearchStructuredMaterialTypes,
  };
}
