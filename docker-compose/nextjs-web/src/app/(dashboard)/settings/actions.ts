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
import type { TrialPricingSettings } from "@/lib/trial-pricing-settings";

const settingsInput = z.object({
  materialPriceBasis: z.enum(["MAX", "LATEST", "AVERAGE"]),
  materialPriceLookbackMonths: z.number().int().min(1).max(36),
  machiningRatePer10min: z.number().min(0),
  spareShapeCount: z.number().int().min(1),
  correctionFactor: z.number().min(0),
  ldChargePer10min: z.number().min(0),
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
