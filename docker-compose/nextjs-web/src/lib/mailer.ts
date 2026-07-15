/**
 * mailer.ts — メール送信（nodemailer / さくらのレンタルサーバー SMTP）。server-only.
 *
 * 環境変数（未設定ならメールチャネルは黙ってスキップ — 開発環境で安全）:
 *   SMTP_HOST   … 例: example.sakura.ne.jp（さくらは初期ドメインの SMTP を利用）
 *   SMTP_PORT   … 587 (STARTTLS, 既定) または 465 (SSL)
 *   SMTP_USER   … メールアドレス全体（さくらはフルアドレスがユーザー名）
 *   SMTP_PASS   … メールパスワード
 *   SMTP_SECURE … "true" で SSL(465)。既定 false（587 STARTTLS）
 *   MAIL_FROM   … 差出人。既定 `CKK 業務管理システム <SMTP_USER>`
 */

import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null | undefined;

/** SMTP 設定済みか（設定 UI の表示・ヘルスチェック用）。 */
export function isMailerConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

function transporter(): Transporter | null {
  if (cached !== undefined) return cached;
  if (!isMailerConfigured()) {
    cached = null;
    return cached;
  }
  const secure = process.env.SMTP_SECURE === "true";
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? (secure ? 465 : 587)),
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cached;
}

function fromAddress(): string {
  return (
    process.env.MAIL_FROM ?? `CKK 業務管理システム <${process.env.SMTP_USER}>`
  );
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
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  const t = transporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
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
    ? "https://ckk.kai-lab.net"
    : "https://ckk-dev.kai-lab.net";
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
    CKK 業務管理システムからの自動送信メールです。通知設定はアプリの「設定 → 通知設定」から変更できます。
  </p>
</div>`;
  return sendMail({
    to: input.to,
    subject: `【CKK】${input.title}`,
    text: text || input.title,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
