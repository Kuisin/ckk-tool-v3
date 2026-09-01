"use server";

/**
 * /portal/d/[token] の確認コード（VERIFY ポリシー）。
 *
 * ■ 送り先はリンクに束縛されたアドレスだけ
 * 訪問者が入力したアドレスへは**決して送らない**。これが
 * 「転送されたリンクは転送先では無価値」を成立させている唯一の点。
 * だから発行フォームはアドレスを受け取らない（トークンだけ）。
 */

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { resolveDeviceContext } from "@/lib/device-signals";
import type { LoginFailureReason } from "@/lib/login-attempt-core";
import { recordLoginAttempt } from "@/lib/login-attempts";
import { createPortalSession } from "@/lib/portal-auth";
import { consumePortalLink, resolvePortalLink } from "@/lib/portal-links";
import { sendPortalOtpMail } from "@/lib/portal-mail";
import { issuePortalChallenge, verifyPortalChallenge } from "@/lib/portal-otp";
import { requirePortalFeature } from "@/lib/portal-page";
import {
  checkPortalLimit,
  clearPortalLimit,
  recordPortalLimitFailure,
} from "@/lib/portal-rate-limit";

const tokenSchema = z.string().trim().min(20).max(200);
const codeSchema = z.string().trim().min(4).max(32);
const refSchema = z.string().trim().min(10).max(64);

async function ctx() {
  const h = await headers();
  const device = resolveDeviceContext({ headers: h } as unknown as Request);
  return { device, ip: device.ip, userAgent: device.userAgent };
}

export async function requestLinkOtp(
  formData: FormData,
): Promise<{ ok: true; challengeRef: string | null; message: string }> {
  const tr = await getTranslations();
  const issueMessage = tr("portal.linkActions.otpIssued");
  requirePortalFeature();
  const { device, ip, userAgent } = await ctx();
  const token = tokenSchema.safeParse(String(formData.get("token") ?? ""));
  if (!token.success) {
    return { ok: true, challengeRef: null, message: issueMessage };
  }

  if ((await checkPortalLimit("OTP_ISSUE_IP", ip ?? "anon")).locked) {
    return { ok: true, challengeRef: null, message: issueMessage };
  }
  await recordPortalLimitFailure("OTP_ISSUE_IP", ip ?? "anon");

  const resolved = await resolvePortalLink(token.data);
  if (!resolved.ok || resolved.link.policy !== "VERIFY") {
    // 応答は変えない（リンクの生死を教えない）。
    return { ok: true, challengeRef: null, message: issueMessage };
  }
  const to = resolved.link.boundEmail;
  if (!to) return { ok: true, challengeRef: null, message: issueMessage };

  const issued = await issuePortalChallenge({
    // **リンクの宛先**であって、訪問者の入力ではない。
    email: to,
    linkId: resolved.link.id,
    ipAddress: ip,
    userAgent,
  });

  // アカウントに紐づかない素のアドレス束縛でも送れるようにする。
  const code = issued.code ?? null;
  if (code) {
    const sent = await sendPortalOtpMail({
      to,
      code,
      context: resolved.link.resourceId,
    });
    if (sent !== "SENT") {
      void recordLoginAttempt({
        outcome: "FAILURE",
        method: "PORTAL_LINK",
        reason:
          sent === "BLOCKED_DEV"
            ? "PORTAL_MAIL_BLOCKED_DEV"
            : "PORTAL_MAIL_FAILED",
        device,
      });
    }
  }
  return {
    ok: true,
    challengeRef: issued.challengeRef,
    message: issueMessage,
  };
}

export async function verifyLinkOtp(
  formData: FormData,
): Promise<{ ok: true; href: string } | { ok: false; error: string }> {
  const tr = await getTranslations();
  const verifyError = tr("portal.linkActions.otpInvalid");
  requirePortalFeature();
  const { device, ip, userAgent } = await ctx();
  const token = tokenSchema.safeParse(String(formData.get("token") ?? ""));
  const ref = refSchema.safeParse(String(formData.get("challengeRef") ?? ""));
  const code = codeSchema.safeParse(String(formData.get("code") ?? ""));
  const limitKey = ref.success ? ref.data : (ip ?? "anon");

  if ((await checkPortalLimit("OTP_VERIFY", limitKey)).locked) {
    return { ok: false, error: verifyError };
  }
  if (!token.success || !ref.success || !code.success) {
    await recordPortalLimitFailure("OTP_VERIFY", limitKey);
    return { ok: false, error: verifyError };
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
    void recordLoginAttempt({
      outcome: "FAILURE",
      method: "PORTAL_LINK",
      reason,
      device,
    });
    return { ok: false, error: verifyError };
  }

  // チャレンジが指すリンクと、いま開いているリンクが一致すること。
  const resolved = await resolvePortalLink(token.data);
  if (!resolved.ok || resolved.link.id !== result.linkId) {
    return { ok: false, error: verifyError };
  }
  if (!(await consumePortalLink(resolved.link.id))) {
    return { ok: false, error: verifyError };
  }

  await clearPortalLimit("OTP_VERIFY", limitKey);
  await createPortalSession({
    linkId: resolved.link.id,
    method: "PORTAL_LINK",
    ipAddress: ip,
    userAgent,
  });
  void recordLoginAttempt({
    outcome: "SUCCESS",
    method: "PORTAL_LINK",
    portalAccountId: resolved.link.portalAccountId,
    device,
  });

  return {
    ok: true,
    href: `/portal/documents/${resolved.link.resourceType}/${encodeURIComponent(resolved.link.resourceId)}`,
  };
}
