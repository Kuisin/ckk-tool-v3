/**
 * /api/kiosk/attest — 端末アテステーション（Android ラッパーの Keystore 鍵）。
 *
 * GET  — チャレンジ発行: { nonce }（2分・単回・この端末に束縛）
 * POST — { nonce, publicKey (SPKI DER base64), signature (DER base64) }
 *        署名を検証し、鍵が未束縛なら TOFU で端末行に束縛（fingerprint 保存）。
 *        既存鍵と不一致は KEY_MISMATCH（管理者が SY09 で鍵リセット → 再束縛）。
 *        成功で kiosk_attest Cookie（HMAC・12h）を発行。
 *
 * 有効化（KIOSK_ATTESTATION=required）時、getDevice() はこの Cookie が無いと
 * ATTEST_REQUIRED を返す — つまりログイン関連 API はラッパー経由でしか通らない。
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
import { prisma } from "@/lib/db";
import { getDevice } from "@/lib/kiosk-auth";
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
});

export async function POST(req: Request) {
  const device = await getDevice({ skipAttest: true });
  if (!device.ok) {
    return NextResponse.json(
      { state: "DEVICE_INVALID", reason: device.reason },
      { status: 403 },
    );
  }
  const secret = attestSecret();
  if (!secret) {
    return NextResponse.json({ state: "NOT_CONFIGURED" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { nonce, publicKey, signature } = parsed.data;

  if (!consumeTicket(nonce, "ATTEST", device.device.id)) {
    return NextResponse.json({ state: "TICKET_EXPIRED" }, { status: 410 });
  }
  if (!verifyDeviceSignature(publicKey, nonce, signature)) {
    return NextResponse.json({ state: "BAD_SIGNATURE" }, { status: 403 });
  }

  const row = await prisma.kioskDevice.findUnique({
    where: { id: device.device.id },
    select: { devicePublicKey: true },
  });
  if (!row) {
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
      return NextResponse.json({ state: "KEY_IN_USE" }, { status: 409 });
    }
  } else if (row.devicePublicKey !== publicKey) {
    return NextResponse.json({ state: "KEY_MISMATCH" }, { status: 403 });
  }

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
