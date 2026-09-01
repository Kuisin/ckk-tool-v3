"use server";

/**
 * ログイン履歴（SY0D）の Server Actions。
 *
 * 詳細（ドロワー）を**開いたときだけ**監査に VIEW を残す。一覧を描くたびに
 * 監査行を出すとノイズになって、本当に中身を見た事実が埋もれる。
 */

import { getTranslations } from "next-intl/server";
import { recordAudit } from "@/lib/audit";
import { getLoginAttempt, type LoginAttemptDetail } from "@/lib/login-attempts";
import { elevationAuditNote, useElevation } from "@/lib/privileged-access";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

export async function fetchLoginAttemptDetail(
  id: string,
): Promise<ActionResult<LoginAttemptDetail>> {
  const tr = await getTranslations();
  // 1 件の認証イベントを IP・端末シグネチャ・所有区分まで開く操作。
  // 一覧（誰がいつ入ったか）は personal_data:READ で見えるが、ここから先は
  // 従業員監視に隣接するので承認された期間だけに絞る。
  const gate = await useElevation("personal_data.login_history_detail");
  if (!gate.ok) return actionError(gate.error);

  const row = await getLoginAttempt(id);
  if (!row) {
    return actionError(tr("settings.loginHistoryActions.recordNotFound"));
  }

  await recordAudit({
    action: "VIEW",
    tableName: "login_attempts",
    recordId: id,
    after: {
      viewed: true,
      ...elevationAuditNote(gate, "personal_data.login_history_detail"),
    },
  });
  return actionOk(row);
}
