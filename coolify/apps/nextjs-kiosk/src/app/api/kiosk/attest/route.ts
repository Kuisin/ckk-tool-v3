/**
 * /api/kiosk/attest — 端末アテステーション（Android ラッパーの Keystore 鍵）。
 *
 * GET  — チャレンジ発行: { nonce }（2分・単回・この端末に束縛）
 * POST — { nonce, publicKey (SPKI DER base64), signature (DER base64),
 *          profile? (署名済み端末プロファイル・v0.6.0+) }
 *        署名を検証し、鍵が未束縛なら TOFU で端末行に束縛（fingerprint 保存）。
 *        既存鍵と不一致は KEY_MISMATCH（管理者が SY09 で鍵リセット → 再束縛）。
 *        成功で kiosk_attest Cookie（HMAC・12h）を発行。
 *
 *        profile が付いていれば、署名対象は `nonce\nprofileJson`。
 *        **旧 APK（profile なし）は従来どおり nonce だけで検証する** —
 *        サーバーを先に出して端末を後から更新できるようにするため。
 *        少なくとも 1 リリースは両方受けること。
 *
 * 有効化（KIOSK_ATTESTATION=required）時、getDevice() はこの Cookie が無いと
 * ATTEST_REQUIRED を返す — つまりログイン関連 API はラッパー経由でしか通らない。
 *
 * ここの失敗（署名不正・鍵不一致・鍵の使い回し）は**最も重い security 事象**
 * なので、成否とも認証イベント（app.login_attempts）に残す。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ATTEST_COOKIE,
  ATTEST_COOKIE_TTL_MS,
  attestSecret,
  fingerprintOf,
  mintAttestCookie,
  verifyDeviceSignature,
} from "@/lib/attest-core";
import { parseCidrList } from "@/lib/cidr-core";
import { prisma } from "@/lib/db";
import { classifyDeviceOwnership } from "@/lib/device-ownership-core";
import {
  toVerifiedWrapperProfile,
  verifyDeviceProfile,
} from "@/lib/device-profile";
import { getDevice } from "@/lib/kiosk-auth";
import {
  attemptContext,
  deny,
  denyDevice,
  recordKioskFailure,
  recordKioskSuccess,
} from "@/lib/kiosk-login-log";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";
import { consumeTicket, issueTicket } from "@/lib/tickets";

export async function GET() {
  const device = await getDevice({ skipAttest: true });
  if (!device.ok) {
    return NextResponse.json(
      { state: "DEVICE_INVALID", reason: device.reason },
      { status: 403 },
    );
  }
  const nonce = issueTicket("", device.device.id, "ATTEST");
  return NextResponse.json({ nonce });
}

const bodySchema = z.object({
  nonce: z.string().min(1),
  publicKey: z.string().min(80).max(400), // P-256 SPKI DER base64 は ~120 文字
  signature: z.string().min(1).max(400),
  /** 署名済み端末プロファイル（v0.6.0+）。旧 APK には無い */
  profile: z.string().min(2).max(4000).optional(),
});

export async function POST(req: Request) {
  const device = await getDevice({ skipAttest: true });
  if (!device.ok) {
    return denyDevice(attemptContext(req, null), device.reason, "ATTEST");
  }
  const ctx = attemptContext(req, device.device);
  const secret = attestSecret();
  if (!secret) {
    return deny(ctx, "NOT_CONFIGURED", 503, { method: "ATTEST" });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return deny(ctx, "BAD_REQUEST", 400, { method: "ATTEST" });
  }
  const { nonce, publicKey, signature, profile } = parsed.data;

  if (!consumeTicket(nonce, "ATTEST", device.device.id)) {
    return deny(ctx, "TICKET_EXPIRED", 410, { method: "ATTEST" });
  }

  // profile 付き（v0.6.0+）は `nonce\nprofileJson` を、無ければ nonce だけを
  // 検証する。検証を通ってからでないとプロファイルを parse しない。
  const verified = profile
    ? verifyDeviceProfile(publicKey, nonce, { profile, signature })
    : null;
  if (profile) {
    if (!verified?.ok) {
      // 署名は正しいが中身が不正なのか、署名自体が不正なのかは
      // 端末側からは区別させない（どちらも同じ扱いで良い事象）
      return deny(ctx, "BAD_PROFILE", 403, { method: "ATTEST" });
    }
  } else if (!verifyDeviceSignature(publicKey, nonce, signature)) {
    return deny(ctx, "BAD_SIGNATURE", 403, { method: "ATTEST" });
  }

  const row = await prisma.kioskDevice.findUnique({
    where: { id: device.device.id },
    select: { devicePublicKey: true },
  });
  if (!row) {
    recordKioskFailure(ctx, "DEVICE_NOT_FOUND", { method: "ATTEST" });
    return NextResponse.json({ state: "DEVICE_INVALID" }, { status: 403 });
  }

  if (!row.devicePublicKey) {
    // TOFU: 初回アテステーションで鍵を束縛（fingerprint unique 制約で
    // 別端末の鍵再利用は弾かれる）
    try {
      await prisma.kioskDevice.update({
        where: { id: device.device.id },
        data: {
          devicePublicKey: publicKey,
          fingerprint: fingerprintOf(publicKey),
        },
      });
    } catch {
      return deny(ctx, "KEY_IN_USE", 409, { method: "ATTEST" });
    }
  } else if (row.devicePublicKey !== publicKey) {
    return deny(ctx, "KEY_MISMATCH", 403, { method: "ATTEST" });
  }

  // 所有区分の判定 — 署名検証を通ったプロファイルだけが判定器に届く。
  const verdict = classifyDeviceOwnership({
    wrapper: verified?.ok ? toVerifiedWrapperProfile(verified.profile) : null,
    kioskDeviceLinked: true,
    attested: true,
    ip: ctx.ip,
    corporateCidrs: parseCidrList(process.env.CORPORATE_CIDRS),
  });
  await prisma.kioskDevice
    .update({
      where: { id: device.device.id },
      data: {
        ownership: verdict.ownership,
        ownershipSource: verdict.source,
        lastIpAddress: clientIpOf(req),
        userAgent: userAgentOf(req),
        // プロファイルは payload と署名も残す（後から独立に再検証できる証拠）
        ...(verified?.ok
          ? {
              deviceProfile: verified.profile,
              deviceProfilePayload: verified.payload,
              deviceProfileSig: verified.signature,
              deviceProfileAt: new Date(),
            }
          : {}),
      },
    })
    .catch(() => undefined);

  recordKioskSuccess(ctx, { method: "ATTEST" });
  const res = NextResponse.json({ state: "OK" });
  res.cookies.set(ATTEST_COOKIE, mintAttestCookie(secret, device.device.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ATTEST_COOKIE_TTL_MS / 1000),
  });
  return res;
}

export const dynamic = "force-dynamic";
