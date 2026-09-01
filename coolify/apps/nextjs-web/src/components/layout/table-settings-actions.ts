"use server";

/**
 * Server Actions — 一覧表の「表示する列」（個人ごと）。
 *
 * どの画面の表からも呼ぶので、画面ごとの actions.ts ではなくここに置く
 * （notification-actions.ts と同じ置き方）。自分の設定を自分で変えるだけなので
 * 権限チェックは無く、対象行はセッションのユーザー id で決まる。
 *
 * **監査ログは残さない** — audit_logs は業務記録の台帳で、どの列を出すかは
 * そこに載せるものではない。
 */

import { getTranslations } from "next-intl/server";
import { sessionUserId } from "@/lib/authz";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";
import {
  isTableSettingKey,
  sanitizeHiddenColumns,
} from "@/lib/table-settings-core";
import { writeViewSetting } from "@/lib/view-settings";

export async function saveTableColumns(
  key: string,
  hidden: string[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const userId = await sessionUserId();
  if (!userId)
    return actionError(tr("layout.tableSettingsActions.loginRequired"));
  // 画面が正しく送っていても受け取り側で確かめる（キーは DB の主キーの一部）。
  if (!isTableSettingKey(key))
    return actionError(tr("layout.tableSettingsActions.invalidTable"));

  try {
    await writeViewSetting(userId, key, {
      hidden: sanitizeHiddenColumns({ hidden }),
    });
    return actionOk();
  } catch {
    return actionError(tr("layout.tableSettingsActions.saveFailed"));
  }
}
