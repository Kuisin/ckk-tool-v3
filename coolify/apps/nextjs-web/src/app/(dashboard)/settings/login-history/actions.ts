"use server";

/**
 * ログイン履歴（SY0D）の Server Actions。
 *
 * 詳細（ドロワー）を**開いたときだけ**監査に VIEW を残す。一覧を描くたびに
 * 監査行を出すとノイズになって、本当に中身を見た事実が埋もれる。
 */

import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { getLoginAttempt, type LoginAttemptDetail } from "@/lib/login-attempts";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

export async function fetchLoginAttemptDetail(
  id: string,
): Promise<ActionResult<LoginAttemptDetail>> {
  const authz = await checkPermission("system", "READ");
  if (!authz.ok) return actionError(authz.error);

  const row = await getLoginAttempt(id);
  if (!row) return actionError("記録が見つかりません");

  await recordAudit({
    action: "VIEW",
    tableName: "login_attempts",
    recordId: id,
    after: { viewed: true },
  });
  return actionOk(row);
}
