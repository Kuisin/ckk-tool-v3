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

import { getTranslations } from "next-intl/server";
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
  const tr = await getTranslations();
  if (!isDevFeatureEnabled("portal")) return "BLOCKED_DEV";
  if (!allowed(input.to)) {
    // dev の安全弁。**アラートの対象ではない**（設定どおりの挙動）。
    // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
    console.warn(
      "[portal-mail] blocked (allowlist): PORTAL_MAIL_ALLOWLIST に無い宛先",
    );
    return "BLOCKED_DEV";
  }
  if (!isMailerConfigured()) {
    // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
    console.error(
      "[portal-mail] send failed: MAIL_API_URL / MAIL_API_TOKEN が未設定",
    );
    return "FAILED";
  }

  const pretty = formatCode(input.code);
  const what = input.context
    ? tr("settings.portalMail.viewingContext", { context: input.context })
    : tr("settings.portalMail.login");
  const subject = tr("settings.portalMail.ckkVerificationCode");

  const text = [
    tr("settings.portalMail.theVerificationCodeForWhat", { what }),
    "",
    `    ${pretty}`,
    "",
    tr("settings.portalMail.validFor10MinutesEnterIt"),
    "",
    tr("settings.portalMail.ifThisIsUnexpectedDiscard"),
    tr("settings.portalMail.doNotShareTheCodeWith"),
  ].join("\n");

  const html = `<div style="font-family:'Noto Sans JP',system-ui,sans-serif;max-width:560px">
  <p>${escapeHtml(tr("settings.portalMail.theVerificationCodeForWhat", { what }))}</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:.15em;margin:24px 0;color:#228be6">${escapeHtml(pretty)}</p>
  <p>${escapeHtml(tr("settings.portalMail.validFor10MinutesEnterIt"))}</p>
  <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
  <p style="font-size:12px;color:#868e96">${escapeHtml(tr("settings.portalMail.ifThisIsUnexpectedDiscard"))} ${escapeHtml(tr("settings.portalMail.doNotShareTheCodeWith"))}</p>
</div>`;

  const ok = await sendMail({ to: input.to, subject, text, html });
  if (!ok) {
    // **ここが運用の唯一の手がかり。** 画面は成功と同じものを返すので
    // （アカウントの存在を漏らさないため）、利用者は「コードが来ない」としか
    // 言えない。Grafana の portal_otp_mail_failed がこの行を見ている。
    console.error("[portal-mail] send failed: リレーが受け取らなかった"); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
  }
  return ok ? "SENT" : "FAILED";
}
