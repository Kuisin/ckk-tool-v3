/**
 * trial-pricing-settings.ts — system pricing policy for 見積試算.
 *
 * Controls how the default material reference price is derived from purchase
 * history (basis + lookback window). Editable from the system settings page.
 * Persistence is app.system_settings (`trial_pricing.*` keys) — see
 * lib/system-settings.ts. This module keeps only the shared types/defaults.
 */

import type { MaterialPriceBasis } from "./material-pricing-core";

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
}

export const DEFAULT_TRIAL_PRICING_SETTINGS: TrialPricingSettings = {
  materialPriceBasis: "MAX",
  materialPriceLookbackMonths: 6,
  machiningRatePer10min: 2000,
  spareShapeCount: 3,
  correctionFactor: 1.25,
  ldChargePer10min: 7500,
};

export const MATERIAL_PRICE_BASIS_OPTIONS: {
  value: MaterialPriceBasis;
  label: string;
}[] = [
  { value: "MAX", label: "最高単価（期間内）" },
  { value: "LATEST", label: "最新単価" },
  { value: "AVERAGE", label: "平均単価（期間内）" },
];
