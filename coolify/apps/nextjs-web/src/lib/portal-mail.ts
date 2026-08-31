/**
 * portal-mail.ts — ポータルが出すメール。server-only.
 *
 * ■ NOTIFY_EXTERNAL_DISABLED では止めない
 *
 * あのフラグは「dev が業務イベントで実在の社員にメールする」のを止めるための
 * もの。確認コードまで止めると dev でポータルを検証できなくなる（しかも一番
 * 検証したい部分）。代わりに独立した許可リストを持つ。
 *
 * ■ 許可リストは未設定なら送らない
 *
 * dev の DB には実在の取引先データが入っている。開けっ放しの既定にすると、
 * 検証中に本物の顧客へコードが飛ぶ。機能が dev 限定である間は
 * APP_ENV === "main" の分岐を**作らない** — 本番公開の PR で一緒に足す。
 */

import "server-only";

import { formatCode } from "./crockford";
import { isDevFeatureEnabled } from "./dev-features";
import { escapeHtml } from "./format";
import { isMailerConfigured, sendMail } from "./mailer";
import { isMailAllowlisted } from "./portal-mail-core";

export type PortalMailResult = "SENT" | "FAILED" | "BLOCKED_DEV";

function allowed(to: string): boolean {
  return isMailAllowlisted(to, process.env.PORTAL_MAIL_ALLOWLIST);
}

/**
 * 確認コードを送る。
 *
 * 戻り値は**記録のため**だけに区別する — 画面はどの結果でも同じものを出す
 * （区別するとアカウントの存在が漏れる。呼び出し側の責任）。
 */
export async function sendPortalOtpMail(input: {
  to: string;
  code: string;
  /** リンク経由なら、その書類の呼び名（本文に出す）。 */
  context?: string | null;
}): Promise<PortalMailResult> {
  if (!isDevFeatureEnabled("portal")) return "BLOCKED_DEV";
  if (!allowed(input.to)) {
    console.warn(
      `[portal-mail] 許可リスト外のため送信しない（PORTAL_MAIL_ALLOWLIST）`,
    );
    return "BLOCKED_DEV";
  }
  if (!isMailerConfigured()) return "FAILED";

  const pretty = formatCode(input.code);
  const what = input.context ? `「${input.context}」の閲覧` : "ログイン";
  const subject = "【CKK】確認コード";

  const text = [
    `${what}の確認コードは次のとおりです。`,
    "",
    `    ${pretty}`,
    "",
    "有効期限は 10 分です。画面に入力してください。",
    "",
    "心当たりが無い場合は、このメールを破棄してください。",
    "コードを他人に教えないでください。",
  ].join("\n");

  const html = `<div style="font-family:'Noto Sans JP',system-ui,sans-serif;max-width:560px">
  <p>${escapeHtml(what)}の確認コードは次のとおりです。</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:.15em;margin:24px 0;color:#228be6">${escapeHtml(pretty)}</p>
  <p>有効期限は 10 分です。画面に入力してください。</p>
  <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
  <p style="font-size:12px;color:#868e96">心当たりが無い場合は、このメールを破棄してください。コードを他人に教えないでください。</p>
</div>`;

  const ok = await sendMail({ to: input.to, subject, text, html });
  return ok ? "SENT" : "FAILED";
}
