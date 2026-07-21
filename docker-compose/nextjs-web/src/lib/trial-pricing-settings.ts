/**
 * trial-pricing-settings.ts — system pricing policy for 見積試算.
 *
 * Controls how the default material reference price is derived from purchase
 * history (basis + lookback window). Editable from the system settings page.
 * Persistence is app.system_settings (`trial_pricing.*` keys) — see
 * lib/system-settings.ts. This module keeps only the shared types/defaults.
 */

import type { MaterialPriceBasis } from "./material-pricing-core";
import type { TrialPricingOptions } from "./trial-pricing";
import {
  type Criterion,
  type CustomInputDef,
  DEFAULT_CRITERIA,
  DEFAULT_CUSTOM_INPUTS,
  DEFAULT_LOOKUP_TABLES,
  type LookupTable,
} from "./trial-pricing-criteria";

export interface TrialPricingSettings {
  /** 材料参照価格の算出方法 (default MAX = 直近期間の最高単価). */
  materialPriceBasis: MaterialPriceBasis;
  /** さかのぼる月数 (default 6). */
  materialPriceLookbackMonths: number;
  /** 仕入実績が無いときに使う既定材料単価 (¥/1000mm)。0 = 既定なし（従来どおり0）. */
  defaultMaterialPrice: number;
  // ── 計算基準（自由設定）＋カスタム入力 ──────────────────────────────────
  // 旧「既定値・係数（グローバル）」の 4 値（加工単価/予備形状本数/補正値/LDチャージ）
  // は customInputs の scope:"global" 固定係数へ移行した。
  /** 見積単価を構成する計算基準（順序付き。既定 = 従来ロジック）. */
  criteria: Criterion[];
  /** 管理者が追加したカスタム入力項目（試算フォームに表示 + 式の変数）. */
  customInputs: CustomInputDef[];
  /** 管理者が定義したルックアップ表（式内で lookup("<name>", key)）. */
  lookupTables: LookupTable[];
  // ── 廃止: カスタム計算 JS（設定 UI 削除・エンジンでも未適用。互換のため残置）──
  /** @deprecated 未使用. */
  customScriptEnabled: boolean;
  /** @deprecated 未使用. */
  customScript: string;
}

export const DEFAULT_TRIAL_PRICING_SETTINGS: TrialPricingSettings = {
  materialPriceBasis: "MAX",
  materialPriceLookbackMonths: 6,
  defaultMaterialPrice: 0,
  criteria: DEFAULT_CRITERIA,
  customInputs: DEFAULT_CUSTOM_INPUTS,
  lookupTables: DEFAULT_LOOKUP_TABLES,
  customScriptEnabled: false,
  customScript: "",
};

/**
 * 試算エンジン (`calcTrialPricing`) へ渡すオプションを設定から導出する。
 * 全ての計算呼び出し（フォーム・一覧・詳細・価格表変換）で使い、係数と
 * カスタム計算が画面間で一致するようにする。
 */
export function toTrialPricingOptions(
  settings: TrialPricingSettings,
): TrialPricingOptions {
  return {
    // 補正値・LDチャージ・加工単価・予備形状本数は customInputs(scope:"global") 経由。
    criteria: settings.criteria,
    customInputs: settings.customInputs,
    lookupTables: settings.lookupTables,
    // カスタム計算 JS は廃止したため後処理は行わない。
  };
}

export const MATERIAL_PRICE_BASIS_OPTIONS: {
  value: MaterialPriceBasis;
  label: string;
}[] = [
  { value: "MAX", label: "最高単価（期間内）" },
  { value: "LATEST", label: "最新単価" },
  { value: "AVERAGE", label: "平均単価（期間内）" },
];
