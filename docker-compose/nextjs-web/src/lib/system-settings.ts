import "server-only";

/**
 * system-settings.ts — typed adapter for the 試算 settings.
 *
 * Maps `TrialPricingSettings` onto `trial_pricing.*` keys in the single generic
 * config table (see `app-config.ts`). Values are stored as JSON primitives.
 * Reads fill unset keys with `DEFAULT_TRIAL_PRICING_SETTINGS`.
 */

import { z } from "zod";
import { readConfigNamespace, writeConfigValues } from "./app-config";
import {
  type CustomInputDef,
  criterionSchema,
  customInputDefSchema,
  GLOBAL_CUSTOM_INPUTS,
  lookupTableSchema,
} from "./trial-pricing-criteria";
import {
  DEFAULT_TRIAL_PRICING_SETTINGS,
  type TrialPricingSettings,
} from "./trial-pricing-settings";

const NAMESPACE = "trial_pricing";

const KEY_MAP: Record<keyof TrialPricingSettings, string> = {
  materialPriceBasis: "trial_pricing.material_price_basis",
  materialPriceLookbackMonths: "trial_pricing.lookback_months",
  defaultMaterialPrice: "trial_pricing.default_material_price",
  criteria: "trial_pricing.criteria",
  customInputs: "trial_pricing.custom_inputs",
  lookupTables: "trial_pricing.lookup_tables",
  customScriptEnabled: "trial_pricing.custom_script_enabled",
  customScript: "trial_pricing.custom_script",
};

/**
 * 永続化されたカスタム入力に、scope:"global" の既定固定係数（補正値/LDチャージ/
 * 加工単価/予備形状本数）を必ず含める。旧データや空配列でも 4 係数を復元し、
 * 計算式（final/ld/machining/shapeOut）が参照切れにならないようにする。
 */
function mergeGlobalCustomInputs(
  persisted: CustomInputDef[],
): CustomInputDef[] {
  const byKey = new Set(persisted.map((d) => d.key));
  const missing = GLOBAL_CUSTOM_INPUTS.filter((g) => !byKey.has(g.key));
  return missing.length ? [...missing, ...persisted] : persisted;
}

const criteriaArraySchema = z.array(criterionSchema);
const customInputsArraySchema = z.array(customInputDefSchema);
const lookupTablesArraySchema = z.array(lookupTableSchema);

/** 試算設定 — 未設定キーは既定値で補完。 */
export async function getTrialPricingSettings(): Promise<TrialPricingSettings> {
  const byKey = await readConfigNamespace(NAMESPACE);
  const out = { ...DEFAULT_TRIAL_PRICING_SETTINGS };
  for (const [field, key] of Object.entries(KEY_MAP) as [
    keyof TrialPricingSettings,
    string,
  ][]) {
    const v = byKey.get(key);
    if (v === undefined || v === null) continue;
    switch (field) {
      case "materialPriceBasis":
        if (v === "MAX" || v === "LATEST" || v === "AVERAGE") {
          out.materialPriceBasis = v;
        }
        break;
      case "customScript":
        if (typeof v === "string") out.customScript = v;
        break;
      case "customScriptEnabled":
        if (typeof v === "boolean") out.customScriptEnabled = v;
        break;
      case "criteria": {
        const parsed = criteriaArraySchema.safeParse(v);
        if (parsed.success && parsed.data.length > 0)
          out.criteria = parsed.data;
        break;
      }
      case "customInputs": {
        const parsed = customInputsArraySchema.safeParse(v);
        if (parsed.success)
          out.customInputs = mergeGlobalCustomInputs(parsed.data);
        break;
      }
      case "lookupTables": {
        const parsed = lookupTablesArraySchema.safeParse(v);
        // 空配列は既定（Excel 由来 39 表）を維持（criteria と同様のガード）。
        if (parsed.success && parsed.data.length > 0)
          out.lookupTables = parsed.data;
        break;
      }
      default:
        if (typeof v === "number") out[field] = v;
        break;
    }
  }
  return out;
}

/** 全キーを upsert（Server Action から呼ぶ）。 */
export async function saveTrialPricingSettings(
  s: TrialPricingSettings,
): Promise<void> {
  const entries: Record<string, unknown> = {};
  for (const [field, key] of Object.entries(KEY_MAP) as [
    keyof TrialPricingSettings,
    string,
  ][]) {
    entries[key] = s[field];
  }
  await writeConfigValues(entries);
}
