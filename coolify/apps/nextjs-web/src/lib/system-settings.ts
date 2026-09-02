import "server-only";

/**
 * system-settings.ts — typed adapter for the 価格試算 settings.
 *
 * Maps `TrialPricingSettings` onto `trial_pricing.*` keys in the single generic
 * config table (see `app-config.ts`). Values are stored as JSON primitives.
 * Reads fill unset keys with `DEFAULT_TRIAL_PRICING_SETTINGS`.
 */

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { readConfigNamespace, writeConfigValues } from "./app-config";
import {
  type CustomInputDef,
  criterionSchema,
  customInputDefSchema,
  GLOBAL_CUSTOM_INPUTS,
  lookupTableSchema,
  mergeBuiltinToolTypes,
  toolTypeDefSchema,
} from "./trial-pricing-criteria";
// 旧ルックアップ表 ID（例: coating:CX200 → coating-cx200）は読み出し時に正規化
// し、次回保存で新 ID が永続化される（ID 形式統一以前のデータ互換）。
import {
  normalizeLegacyExpressionIds,
  normalizeLegacyLookupIds,
} from "./trial-pricing-data";
import {
  DEFAULT_TRIAL_PRICING_SETTINGS,
  type TrialPricingSettings,
} from "./trial-pricing-settings";

const NAMESPACE = "trial_pricing";

const KEY_MAP: Record<keyof TrialPricingSettings, string> = {
  materialPriceBasis: "trial_pricing.material_price_basis",
  materialPriceLookbackMonths: "trial_pricing.lookback_months",
  defaultMaterialPrice: "trial_pricing.default_material_price",
  toolTypes: "trial_pricing.tool_types",
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

const toolTypesArraySchema = z.array(toolTypeDefSchema);

/**
 * 価格試算設定 — 未設定キーは既定値で補完。
 *
 * ここでの safeParse は**永続データの読み出し検証**であって、失敗しても
 * `.error.message` は読まない（既定値へ黙って倒す）。それでも
 * criterionSchema 等は `tr` を要求する共通スキーマ（保存時の Server Action と
 * 共有）なので、ここでも本物の `tr` を渡す。
 */
export async function getTrialPricingSettings(): Promise<TrialPricingSettings> {
  const tr = await getTranslations();
  const criteriaArraySchema = z.array(criterionSchema(tr));
  // 読み出しは ID 形式を強制しない（旧 ID の永続データも受け入れて正規化する。
  // 形式の強制（英数字・ハイフン・アンダースコア）は保存時の lookupTableSchema）。
  const lookupTablesReadSchema = z.array(
    lookupTableSchema(tr).extend({ id: z.string().min(1) }),
  );
  const customInputsArraySchema = z.array(customInputDefSchema(tr));

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
      case "toolTypes": {
        // 組み込み 3 種は常に復元（旧データ・空配列でも欠けない）。
        const parsed = toolTypesArraySchema.safeParse(v);
        if (parsed.success) out.toolTypes = mergeBuiltinToolTypes(parsed.data);
        break;
      }
      case "criteria": {
        const parsed = criteriaArraySchema.safeParse(v);
        if (parsed.success && parsed.data.length > 0)
          out.criteria = normalizeLegacyExpressionIds(parsed.data);
        break;
      }
      case "customInputs": {
        const parsed = customInputsArraySchema.safeParse(v);
        if (parsed.success)
          out.customInputs = mergeGlobalCustomInputs(parsed.data);
        break;
      }
      case "lookupTables": {
        const parsed = lookupTablesReadSchema.safeParse(v);
        // 空配列は既定（Excel 由来 39 表）を維持（criteria と同様のガード）。
        if (parsed.success && parsed.data.length > 0)
          out.lookupTables = normalizeLegacyLookupIds(parsed.data);
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
