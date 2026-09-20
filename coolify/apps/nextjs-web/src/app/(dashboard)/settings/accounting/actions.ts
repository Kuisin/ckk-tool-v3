"use server";

/**
 * Server Actions — 会計連携設定（SY0J）。
 *
 * 保存は `accounting.*` の upsert。秘密は扱わない（科目コードは秘密ではない）ので、
 * 監査ログには設定内容をそのまま before/after で残す。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  type AccountingExportSettings,
  accountingExportSettingsSchema,
} from "@/lib/accounting-export-core";
import {
  getAccountingSettings,
  saveAccountingSettings,
} from "@/lib/accounting-settings";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

const BASE_PATH = "/settings/accounting";

export async function updateAccountingSettings(
  payload: AccountingExportSettings,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = accountingExportSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // 科目コード・消費税コードの形（ACCOUNT_CODE_PATTERN）に外れたときは、
    // zod の英語の定型文ではなく MS0F / MS01 と同じ案内を返す。
    const head = issue?.path[0];
    if (head === "accounts" || head === "taxCodeRules") {
      return actionError(tr("settings.accounting.accountCodeHint"));
    }
    return actionError(issue?.message ?? tr("common.invalidInput"));
  }

  try {
    const before = await getAccountingSettings();
    await saveAccountingSettings(parsed.data);
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "accounting",
      before,
      after: parsed.data,
    });
    revalidatePath(BASE_PATH);
    return actionOk();
  } catch (e) {
    // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
    console.error("[accounting] 設定の保存に失敗しました", e);
    return actionError(tr("settings.aiProviderActions.saveFailed"));
  }
}
