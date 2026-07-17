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
