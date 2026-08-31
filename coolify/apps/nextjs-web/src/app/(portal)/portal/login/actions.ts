"use server";

/**
 * portal/login/actions.ts — ポータルのログイン（確認コード / バックアップコード）。
 *
 * ■ すべての結果を同じ形で返す（アカウント列挙対策）
 *
 * 発行では次の 4 つを区別しない — HTTP も画面もレイテンシも同じ:
 *   ① 登録済み・送信成功 ② 登録済みだが無効 ③ 未登録 ④ 送信失敗
 * ②③ でも「デコイのチャレンジ行」を書くのはそのため（scrypt のコストまで
 * 込みで揃う。副産物としてレート制限にも数えられる）。
 * 「メール送信に失敗しました」は**画面に出さない** — 存在するときだけ出せば
 * オラクルになり、常に出せば半分は嘘になる。運用が気づく場所は
 * login_attempts の PORTAL_MAIL_FAILED 行と Grafana。
 *
 * ■ 形式不正も 1 失敗として数える
 * キオスクの端末設定コードと同じ規則。数えないとコードの形をタダで探れる。
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveDeviceContext } from "@/lib/device-signals";
import type { LoginFailureReason, LoginMethod } from "@/lib/login-attempt-core";
import { recordLoginAttempt } from "@/lib/login-attempts";
import { createPortalSession } from "@/lib/portal-auth";
import { sendPortalOtpMail } from "@/lib/portal-mail";
import {
  consumePortalBackupCode,
  issuePortalChallenge,
  normalizePortalEmail,
  verifyPortalChallenge,
} from "@/lib/portal-otp";
import { requirePortalFeature } from "@/lib/portal-page";
import {
  checkPortalLimit,
  clearPortalLimit,
  recordPortalLimitFailure,
} from "@/lib/portal-rate-limit";

/** 利用者に見せる唯一の文言（成功・未登録・無効・送信失敗すべて共通）。 */
const ISSUE_MESSAGE =
  "入力されたアドレスが登録されていれば、確認コードを送信しました。10 分以内に入力してください。届かない場合は迷惑メールをご確認のうえ、担当営業へご連絡ください。";

/** 照合の失敗も 1 文言に畳む（どこで外したかを教えない）。 */
const VERIFY_ERROR = "確認コードが正しくないか、有効期限が切れています。";
const BACKUP_ERROR = "バックアップコードが正しくありません。";

export interface PortalIssueResult {
  ok: true;
  challengeRef: string | null;
  message: string;
}

export interface PortalActionError {
  ok: false;
  error: string;
}

const emailSchema = z.string().trim().min(3).max(254).email();
const codeSchema = z.string().trim().min(4).max(32);
const refSchema = z.string().trim().min(10).max(64);

async function requestContext() {
  const h = await headers();
  // resolveDeviceContext は req.headers.get() しか触らない（IP / UA / ckk_dev
  // Cookie を読むだけ）。Server Action には Request が無いので、headers() を
  // 同じ形に包んで渡す。ALS（auth-request-context）は Auth.js のルート専用で
  // ここには通っていない。
  const device = resolveDeviceContext({
    headers: h,
  } as unknown as Request);
  return {
    ip: device.ip,
    userAgent: device.userAgent,
    device,
  };
}

function record(
  outcome: "SUCCESS" | "FAILURE",
  method: LoginMethod,
  reason: LoginFailureReason | null,
  portalAccountId: string | null,
  identifier: string | null,
  device: Awaited<ReturnType<typeof requestContext>>["device"],
): void {
  void recordLoginAttempt({
    outcome,
    method,
    reason,
    // 生値は入らない（portalAccountId があると writer 側が null に落とす）。
    identifier,
    portalAccountId,
    device,
  });
}

/** 確認コードを送る。**戻り値は常に成功の形**。 */
export async function requestPortalOtp(
  formData: FormData,
): Promise<PortalIssueResult> {
  requirePortalFeature();
  const { ip, userAgent, device } = await requestContext();
  const raw = String(formData.get("email") ?? "");
  const parsed = emailSchema.safeParse(raw);
  const email = parsed.success ? normalizePortalEmail(parsed.data) : "";

  // 形式不正でも数える（形を探らせない）。IP 側は常に数える。
  if (ip) await recordPortalLimitFailure("OTP_ISSUE_IP", ip);
  if (!parsed.success) {
    if (raw.trim()) await recordPortalLimitFailure("OTP_ISSUE_EMAIL", raw);
    return { ok: true, challengeRef: null, message: ISSUE_MESSAGE };
  }

  const [byEmail, byIp] = await Promise.all([
    checkPortalLimit("OTP_ISSUE_EMAIL", email),
    ip
      ? checkPortalLimit("OTP_ISSUE_IP", ip)
      : Promise.resolve({ locked: false }),
  ]);
  if (byEmail.locked || byIp.locked) {
    record("FAILURE", "PORTAL_OTP", "RATE_LIMITED", null, email, device);
    // ロックされていることも伝えない（応答を変えない）。
    return { ok: true, challengeRef: null, message: ISSUE_MESSAGE };
  }
  // 発行そのものを数える（成功でも積む — 連打でメールを撃たせない）。
  await recordPortalLimitFailure("OTP_ISSUE_EMAIL", email);

  const issued = await issuePortalChallenge({
    email,
    ipAddress: ip,
    userAgent,
  });

  if (!issued.accountId || !issued.code || !issued.email) {
    // 未登録 or 無効。**デコイの行は既に書いてある**ので応答は同じ。
    record(
      "FAILURE",
      "PORTAL_OTP",
      "PORTAL_UNKNOWN_EMAIL",
      null,
      email,
      device,
    );
    return {
      ok: true,
      challengeRef: issued.challengeRef,
      message: ISSUE_MESSAGE,
    };
  }

  const sent = await sendPortalOtpMail({ to: issued.email, code: issued.code });
  if (sent !== "SENT") {
    record(
      "FAILURE",
      "PORTAL_OTP",
      sent === "BLOCKED_DEV" ? "PORTAL_MAIL_BLOCKED_DEV" : "PORTAL_MAIL_FAILED",
      issued.accountId,
      email,
      device,
    );
  }
  return {
    ok: true,
    challengeRef: issued.challengeRef,
    message: ISSUE_MESSAGE,
  };
}

/** 確認コードを照合してセッションを張る。 */
export async function verifyPortalOtp(
  formData: FormData,
): Promise<{ ok: true } | PortalActionError> {
  requirePortalFeature();
  const { ip, userAgent, device } = await requestContext();

  const ref = refSchema.safeParse(String(formData.get("challengeRef") ?? ""));
  const code = codeSchema.safeParse(String(formData.get("code") ?? ""));
  const limitKey = ref.success ? ref.data : (ip ?? "anonymous");

  if ((await checkPortalLimit("OTP_VERIFY", limitKey)).locked) {
    record("FAILURE", "PORTAL_OTP", "RATE_LIMITED", null, null, device);
    return { ok: false, error: VERIFY_ERROR };
  }
  if (!ref.success || !code.success) {
    await recordPortalLimitFailure("OTP_VERIFY", limitKey);
    return { ok: false, error: VERIFY_ERROR };
  }

  const result = await verifyPortalChallenge({
    challengeRef: ref.data,
    code: code.data,
  });

  if (!result.ok) {
    await recordPortalLimitFailure("OTP_VERIFY", limitKey);
    const reason: LoginFailureReason =
      result.failure === "EXPIRED"
        ? "PORTAL_CODE_EXPIRED"
        : result.failure === "ATTEMPTS"
          ? "PORTAL_CODE_ATTEMPTS"
          : "PORTAL_CODE_MISMATCH";
    record("FAILURE", "PORTAL_OTP", reason, null, null, device);
    return { ok: false, error: VERIFY_ERROR };
  }

  await clearPortalLimit("OTP_VERIFY", limitKey);
  await createPortalSession({
    accountId: result.accountId,
    linkId: result.linkId,
    method: "PORTAL_OTP",
    ipAddress: ip,
    userAgent,
  });
  if (result.accountId) {
    await touchLastLogin(result.accountId);
  }
  record("SUCCESS", "PORTAL_OTP", null, result.accountId, null, device);
  return { ok: true };
}

/** バックアップコードでログインする（メールが受け取れないとき）。 */
export async function verifyPortalBackupCode(
  formData: FormData,
): Promise<{ ok: true } | PortalActionError> {
  requirePortalFeature();
  const { ip, userAgent, device } = await requestContext();

  const email = emailSchema.safeParse(String(formData.get("email") ?? ""));
  const code = codeSchema.safeParse(String(formData.get("code") ?? ""));
  const limitKey = email.success
    ? normalizePortalEmail(email.data)
    : (ip ?? "anonymous");

  if ((await checkPortalLimit("BACKUP_VERIFY", limitKey)).locked) {
    record("FAILURE", "PORTAL_BACKUP", "RATE_LIMITED", null, null, device);
    return { ok: false, error: BACKUP_ERROR };
  }
  if (!email.success || !code.success) {
    await recordPortalLimitFailure("BACKUP_VERIFY", limitKey);
    return { ok: false, error: BACKUP_ERROR };
  }

  const result = await consumePortalBackupCode({
    email: email.data,
    code: code.data,
    ipAddress: ip,
  });
  if (!result.ok) {
    await recordPortalLimitFailure("BACKUP_VERIFY", limitKey);
    record(
      "FAILURE",
      "PORTAL_BACKUP",
      "PORTAL_BACKUP_INVALID",
      null,
      null,
      device,
    );
    return { ok: false, error: BACKUP_ERROR };
  }

  await clearPortalLimit("BACKUP_VERIFY", limitKey);
  await createPortalSession({
    accountId: result.accountId,
    method: "PORTAL_BACKUP",
    ipAddress: ip,
    userAgent,
  });
  await touchLastLogin(result.accountId);
  record("SUCCESS", "PORTAL_BACKUP", null, result.accountId, null, device);
  return { ok: true };
}

async function touchLastLogin(accountId: string): Promise<void> {
  await prisma.portalAccount
    .update({ where: { id: accountId }, data: { lastLoginAt: new Date() } })
    .catch(() => {});
}
