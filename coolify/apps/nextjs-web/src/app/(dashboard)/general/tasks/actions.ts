"use server";

/**
 * Server Actions — 承認・予定 (CM01) の個人設定。
 *
 * いまは「どのタブを出すか」だけ。自分の設定を自分で変えるだけなので権限
 * チェックは無く、対象行はセッションのユーザー id で決まる（他人の行は触れない）。
 *
 * **監査ログは残さない** — audit_logs は業務記録の台帳で、見た目の好みは
 * そこに載せるものではない（表示設定 /profile/preferences は users 列を
 * 書き換えるので別扱い）。
 */

import { revalidatePath } from "next/cache";
import { sessionUserId } from "@/lib/authz";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";
import { sanitizeHiddenTabs, TASK_TABS_SETTING_KEY } from "@/lib/tasks-tabs";
import { writeViewSetting } from "@/lib/view-settings";

export async function saveTaskTabsSetting(
  hidden: string[],
): Promise<ActionResult> {
  const userId = await sessionUserId();
  if (!userId) return actionError("ログインしてください");

  // 知らない id は落とす（画面が正しく送っていても、受け取り側で確かめ直す）。
  const clean = sanitizeHiddenTabs({ hidden });
  try {
    await writeViewSetting(userId, TASK_TABS_SETTING_KEY, { hidden: clean });
    revalidatePath("/general/tasks");
    return actionOk();
  } catch {
    return actionError("表示設定の保存に失敗しました");
  }
}
