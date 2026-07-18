"use server";

/**
 * Server Actions — システム設定（試算 価格ポリシー）.
 *
 * app.system_settings の trial_pricing.* キーを一括 upsert する。
 * 読み出しは lib/system-settings.ts（Server Component から）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  getTrialPricingSettings,
  saveTrialPricingSettings,
} from "@/lib/system-settings";
import {
  criterionSchema,
  customInputDefSchema,
  RESERVED_KEYS,
} from "@/lib/trial-pricing-criteria";
import { checkExpressionSyntax } from "@/lib/trial-pricing-engine";
import { checkScriptSyntax } from "@/lib/trial-pricing-script";
import type { TrialPricingSettings } from "@/lib/trial-pricing-settings";

/** カスタム計算 JS の上限（DoS/誤爆の緩衝。通常の後処理なら十分）。 */
const CUSTOM_SCRIPT_MAX = 20_000;

const settingsInput = z.object({
  materialPriceBasis: z.enum(["MAX", "LATEST", "AVERAGE"]),
  materialPriceLookbackMonths: z.number().int().min(1).max(36),
  machiningRatePer10min: z.number().min(0),
  spareShapeCount: z.number().int().min(1),
  correctionFactor: z.number().min(0),
  ldChargePer10min: z.number().min(0),
  criteria: z.array(criterionSchema),
  customInputs: z.array(customInputDefSchema),
  customScriptEnabled: z.boolean(),
  customScript: z
    .string()
    .max(CUSTOM_SCRIPT_MAX, "カスタム計算が長すぎます")
    .default(""),
});

export async function updateTrialPricingSettings(
  payload: TrialPricingSettings,
): Promise<ActionResult> {
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = settingsInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  // 計算基準（自由設定）の検証 — 壊れた式や不正な構成が全ユーザーの試算を
  // 止めないよう、保存時に弾く。
  const enabledCriteria = parsed.data.criteria.filter((c) => c.enabled);
  for (const c of enabledCriteria) {
    const err = checkExpressionSyntax(c.expression);
    if (err) return actionError(`計算基準「${c.name}」の構文エラー: ${err}`);
  }
  const finals = enabledCriteria.filter((c) => c.role === "final");
  if (finals.length !== 1) {
    return actionError(
      "有効な『見積単価（final）』基準をちょうど1つにしてください",
    );
  }
  // カスタム入力キー — 予約語衝突・重複を弾く。
  const seenKeys = new Set<string>();
  for (const d of parsed.data.customInputs) {
    if (RESERVED_KEYS.has(d.key)) {
      return actionError(`カスタム入力キー「${d.key}」は予約語です`);
    }
    if (seenKeys.has(d.key)) {
      return actionError(`カスタム入力キー「${d.key}」が重複しています`);
    }
    seenKeys.add(d.key);
  }
  // 有効化するカスタム計算は構文チェックを通す（壊れた JS が全ユーザーの
  // 試算を止めないよう、保存時に弾く）。
  if (parsed.data.customScriptEnabled) {
    const syntaxError = checkScriptSyntax(parsed.data.customScript);
    if (syntaxError) {
      return actionError(`カスタム計算の構文エラー: ${syntaxError}`);
    }
  }
  try {
    const before = await getTrialPricingSettings();
    await saveTrialPricingSettings(parsed.data);
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "trial_pricing",
      before: { ...before },
      after: { ...parsed.data },
    });
    revalidatePath("/settings");
    revalidatePath("/sales/trial-estimates");
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "設定の保存に失敗しました"));
  }
}
