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
} from "./trial-pricing-criteria";

export interface TrialPricingSettings {
  /** 材料参照価格の算出方法 (default MAX = 直近期間の最高単価). */
  materialPriceBasis: MaterialPriceBasis;
  /** さかのぼる月数 (default 6). */
  materialPriceLookbackMonths: number;
  // ── 試算 共通の既定値・係数（見積入力に含めない必須値）───────────────────
  /** 加工単価 (¥/10分) の既定値. */
  machiningRatePer10min: number;
  /** 予備形状本数 の既定値. */
  spareShapeCount: number;
  /** 2022補正値 (見積単価 = 最低単価 × 掛け率 × 補正値). */
  correctionFactor: number;
  /** LDチャージ (¥/10分). */
  ldChargePer10min: number;
  // ── 計算基準（自由設定）＋カスタム入力 ──────────────────────────────────
  /** 見積単価を構成する計算基準（順序付き。既定 = 従来ロジック）. */
  criteria: Criterion[];
  /** 管理者が追加したカスタム入力項目（試算フォームに表示 + 式の変数）. */
  customInputs: CustomInputDef[];
  // ── カスタム計算（管理者が JS で試算ロジックを拡張）─────────────────────
  /** カスタム計算 JS を適用するか. */
  customScriptEnabled: boolean;
  /** 後処理スクリプト本体（trial-pricing-script.ts の契約）. */
  customScript: string;
}

export const DEFAULT_TRIAL_PRICING_SETTINGS: TrialPricingSettings = {
  materialPriceBasis: "MAX",
  materialPriceLookbackMonths: 6,
  machiningRatePer10min: 2000,
  spareShapeCount: 3,
  correctionFactor: 1.25,
  ldChargePer10min: 7500,
  criteria: DEFAULT_CRITERIA,
  customInputs: DEFAULT_CUSTOM_INPUTS,
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
    correctionFactor: settings.correctionFactor,
    ldChargePer10min: settings.ldChargePer10min,
    criteria: settings.criteria,
    customInputs: settings.customInputs,
    customScript: settings.customScript,
    runCustomScript: settings.customScriptEnabled,
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
