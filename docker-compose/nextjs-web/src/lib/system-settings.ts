import "server-only";

/**
 * system-settings.ts — app.system_settings（単純 KV, _specs/tables.md）の読み書き.
 *
 * 現在のキー: trial_pricing.*（試算の価格ポリシー・既定係数）。
 * 値は JSON カラムなのでプリミティブをそのまま格納する。
 */

import { prisma } from "./db";
import {
  DEFAULT_TRIAL_PRICING_SETTINGS,
  type TrialPricingSettings,
} from "./trial-pricing-settings";

const KEY_MAP: Record<keyof TrialPricingSettings, string> = {
  materialPriceBasis: "trial_pricing.material_price_basis",
  materialPriceLookbackMonths: "trial_pricing.lookback_months",
  machiningRatePer10min: "trial_pricing.machining_rate_per_10min",
  spareShapeCount: "trial_pricing.spare_shape_count",
  correctionFactor: "trial_pricing.correction_factor",
  ldChargePer10min: "trial_pricing.ld_charge_per_10min",
};

/** 試算価格ポリシー — 未設定キーは既定値で補完。 */
export async function getTrialPricingSettings(): Promise<TrialPricingSettings> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { startsWith: "trial_pricing." } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULT_TRIAL_PRICING_SETTINGS };
  for (const [field, key] of Object.entries(KEY_MAP) as [
    keyof TrialPricingSettings,
    string,
  ][]) {
    const v = byKey.get(key);
    if (v === undefined || v === null) continue;
    if (field === "materialPriceBasis") {
      if (v === "MAX" || v === "LATEST" || v === "AVERAGE") {
        out.materialPriceBasis = v;
      }
    } else if (typeof v === "number") {
      out[field] = v;
    }
  }
  return out;
}

/** 全キーを upsert（Server Action から呼ぶ）。 */
export async function saveTrialPricingSettings(
  s: TrialPricingSettings,
): Promise<void> {
  await prisma.$transaction(
    (Object.entries(KEY_MAP) as [keyof TrialPricingSettings, string][]).map(
      ([field, key]) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: s[field] },
          update: { value: s[field] },
        }),
    ),
  );
}
