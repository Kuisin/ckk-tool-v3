/**
 * trial-pricing-settings.ts — system pricing policy for 見積試算.
 *
 * Controls how the default material reference price is derived from purchase
 * history (basis + lookback window). Editable from the system settings page.
 *
 * MIGRATION NOTE: demo persistence is localStorage. Replace load/save with the
 * `feature_flags`/settings table (server) and read it in a Server Component.
 */

import type { MaterialPriceBasis } from "./material-pricing";

export interface TrialPricingSettings {
  /** 材料参照価格の算出方法 (default MAX = 直近期間の最高単価). */
  materialPriceBasis: MaterialPriceBasis;
  /** さかのぼる月数 (default 6). */
  materialPriceLookbackMonths: number;
}

export const DEFAULT_TRIAL_PRICING_SETTINGS: TrialPricingSettings = {
  materialPriceBasis: "MAX",
  materialPriceLookbackMonths: 6,
};

export const MATERIAL_PRICE_BASIS_OPTIONS: {
  value: MaterialPriceBasis;
  label: string;
}[] = [
  { value: "MAX", label: "最高単価（期間内）" },
  { value: "LATEST", label: "最新単価" },
  { value: "AVERAGE", label: "平均単価（期間内）" },
];

const STORAGE_KEY = "ckk.trialPricingSettings";

export function loadTrialPricingSettings(): TrialPricingSettings {
  if (typeof window === "undefined") return DEFAULT_TRIAL_PRICING_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRIAL_PRICING_SETTINGS;
    return { ...DEFAULT_TRIAL_PRICING_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TRIAL_PRICING_SETTINGS;
  }
}

export function saveTrialPricingSettings(s: TrialPricingSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
