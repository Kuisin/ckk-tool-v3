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
  type Criterion,
  criterionSchema,
  customInputDefSchema,
  RESERVED_KEYS,
  TRIAL_TOOL_TYPES,
} from "@/lib/trial-pricing-criteria";
import { checkExpressionSyntax } from "@/lib/trial-pricing-engine";
import { checkScriptSyntax } from "@/lib/trial-pricing-script";
import type { TrialPricingSettings } from "@/lib/trial-pricing-settings";

/** カスタム計算 JS の上限（DoS/誤爆の緩衝。通常の後処理なら十分）。 */
const CUSTOM_SCRIPT_MAX = 20_000;

// 計算基準（criteria）は SY02 メインのリスト + 個別編集ページから
// `updateCriteria` で保存する。スカラー設定は下の settingsInput（criteria を
// 含まない）で保存し、criteria は現状 DB 値を維持する（相互のクロバー防止）。
const settingsInput = z.object({
  materialPriceBasis: z.enum(["MAX", "LATEST", "AVERAGE"]),
  materialPriceLookbackMonths: z.number().int().min(1).max(36),
  machiningRatePer10min: z.number().min(0),
  spareShapeCount: z.number().int().min(1),
  correctionFactor: z.number().min(0),
  ldChargePer10min: z.number().min(0),
  customInputs: z.array(customInputDefSchema),
  customScriptEnabled: z.boolean(),
  customScript: z
    .string()
    .max(CUSTOM_SCRIPT_MAX, "カスタム計算が長すぎます")
    .default(""),
});

const criteriaInput = z.array(criterionSchema);

const TOOL_TYPE_LABEL: Record<string, string> = {
  ROUND_BAR: "丸棒",
  CYLINDER: "円筒",
  OH: "OH付",
};

/**
 * 計算基準の検証 — 壊れた式や不正な構成が全ユーザーの試算を止めないよう、
 * 保存時に弾く。工具種ごとに有効な final がちょうど1つであること。
 */
function validateCriteria(criteria: Criterion[]): string | null {
  const enabled = criteria.filter((c) => c.enabled);
  for (const c of enabled) {
    const err = checkExpressionSyntax(c.expression);
    if (err) return `計算基準「${c.name}」の構文エラー: ${err}`;
  }
  for (const tt of TRIAL_TOOL_TYPES) {
    const finals = enabled.filter(
      (c) =>
        c.role === "final" && (c.toolTypes ?? TRIAL_TOOL_TYPES).includes(tt),
    );
    if (finals.length !== 1) {
      return `工具種「${TOOL_TYPE_LABEL[tt] ?? tt}」に有効な『見積単価（final）』基準をちょうど1つにしてください`;
    }
  }
  return null;
}

/** スカラー設定・カスタム入力・カスタム計算 JS を保存（criteria は不変）。 */
export async function updateTrialPricingSettings(
  payload: TrialPricingSettings,
): Promise<ActionResult> {
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = settingsInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
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
  if (parsed.data.customScriptEnabled) {
    const syntaxError = checkScriptSyntax(parsed.data.customScript);
    if (syntaxError) {
      return actionError(`カスタム計算の構文エラー: ${syntaxError}`);
    }
  }
  try {
    const before = await getTrialPricingSettings();
    // criteria は現状 DB 値を維持（criteria の保存は updateCriteria が担当）。
    await saveTrialPricingSettings({ ...before, ...parsed.data });
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "trial_pricing",
      before: { ...before },
      after: { ...before, ...parsed.data },
    });
    revalidatePath("/settings");
    revalidatePath("/sales/trial-estimates");
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "設定の保存に失敗しました"));
  }
}

/** 計算基準（criteria）のみを保存（リスト操作・個別編集ページから）。 */
export async function updateCriteria(
  criteria: Criterion[],
): Promise<ActionResult> {
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = criteriaInput.safeParse(criteria);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "計算基準が不正です");
  }
  const invalid = validateCriteria(parsed.data);
  if (invalid) return actionError(invalid);
  try {
    const before = await getTrialPricingSettings();
    await saveTrialPricingSettings({ ...before, criteria: parsed.data });
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "trial_pricing.criteria",
      before: { criteria: before.criteria },
      after: { criteria: parsed.data },
    });
    revalidatePath("/settings/trial-pricing-engine");
    revalidatePath("/sales/trial-estimates");
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "計算基準の保存に失敗しました"));
  }
}
