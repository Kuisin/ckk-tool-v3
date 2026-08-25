/**
 * mailer.ts — メール送信。server-only。
 *
 * **社内の mail-api に JSON を 1 回 POST するだけ**。SMTP の作法（トランスポート、
 * TLS、認証の有無、差出人の組み立て）は全部リレー側（coolify/common/mailrelay）に
 * 寄せてある。アプリはどのメールボックスの資格情報も持たない。
 *
 * 環境変数（未設定ならメールチャネルは黙ってスキップ — 開発環境で安全）:
 *   MAIL_API_URL   … 例: http://mail-api:8080
 *   MAIL_API_TOKEN … リレーと同じ共有シークレット
 *
 * 差出人は mail-api が固定する（アプリごとに違う From を許すと、リレーの
 * ALLOWED_SENDER_DOMAINS と食い違ったときに原因が追いにくい）。
 */

import { escapeHtml } from "./format";

/** 送信口が設定済みか（設定 UI の表示・ヘルスチェック用）。 */
export function isMailerConfigured(): boolean {
  return Boolean(process.env.MAIL_API_URL && process.env.MAIL_API_TOKEN);
}

export interface MailInput {
  to: string;
  subject: string;
  /** プレーンテキスト本文（HTML は sendNotificationMail が組み立てる）。 */
  text: string;
  html?: string;
}

/**
 * 1 通送信。未設定なら false（スキップ）。送信失敗は throw せず false
 * （通知のメールチャネルはベストエフォート — 業務処理を止めない）。
 *
 * ここで false が返るのは「リレーが受け取れなかった」場合だけ。受け取った後の
 * 配送失敗はリレー側のキューと Grafana アラート（deferred / bounced）が見る。
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  if (!isMailerConfigured()) return false;
  try {
    const res = await fetch(`${process.env.MAIL_API_URL}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mail-Token": process.env.MAIL_API_TOKEN as string,
      },
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      // 通知 1 通のために業務処理を待たせない。リレーは受け取るだけなので速い。
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(
        `[mailer] 送信失敗 to=${input.to}: ${res.status} ${await res.text()}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[mailer] 送信失敗 to=${input.to}:`, e);
    return false;
  }
}
/** アプリのベース URL（メール内リンク用）。 */
export function appBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  return process.env.APP_ENV === "main"
    ? "https://app.ckk-tool.co.jp"
    : "https://app-dev.ckk-tool.co.jp";
}

/** 通知メール（タイトル + 本文 + アプリ内リンクボタン）を組み立てて送信。 */
export async function sendNotificationMail(input: {
  to: string;
  title: string;
  message?: string | null;
  linkPath?: string | null;
}): Promise<boolean> {
  const url = input.linkPath ? `${appBaseUrl()}${input.linkPath}` : null;
  const text = [input.message ?? "", url ? `\n${url}` : ""].join("").trim();
  const html = `
<div style="font-family:'Noto Sans JP',system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="font-size:16px;border-bottom:2px solid #228be6;padding-bottom:8px">${escapeHtml(input.title)}</h2>
  ${input.message ? `<p style="font-size:14px;line-height:1.7">${escapeHtml(input.message)}</p>` : ""}
  ${
    url
      ? `<p style="margin:24px 0"><a href="${url}" style="background:#228be6;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px">アプリで開く</a></p>`
      : ""
  }
  <p style="font-size:12px;color:#868e96;border-top:1px solid #dee2e6;padding-top:12px;margin-top:32px">
    CKK 業務管理システムからの自動送信メールです。通知設定はアプリの「プロフィール → 通知設定」から変更できます。
  </p>
</div>`;
  return sendMail({
    to: input.to,
    subject: `【CKK】${input.title}`,
    text: text || input.title,
    html,
  });
}
