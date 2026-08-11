/**
 * POST /api/kiosk/setup — 端末登録の開始。
 *
 * PENDING の kiosk_devices 行 + 登録コード（Crockford 12桁・5分期限）を発行。
 * 画面はこのコードを QR + テキストで表示し、管理者が nextjs-web の
 * 端末管理（SY09）で有効化するのを confirm ポーリングで待つ。
 *
 * GET — 端末 Cookie の状態確認（login 画面の初期チェック用）。
 */

import { NextResponse } from "next/server";
import { attestationRequired } from "@/lib/attest-core";
import { generateCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { getDevice } from "@/lib/kiosk-auth";
import {
  REGISTRATION_CODE_LENGTH,
  REGISTRATION_TTL_MS,
} from "@/lib/kiosk-auth-core";

export async function POST(req: Request) {
  // 既に信頼済み端末ならそのまま（登録フェーズはアテスト不要）
  const existing = await getDevice({ skipAttest: true });
  if (existing.ok) {
    return NextResponse.json({
      registered: true,
      deviceId: existing.device.id,
    });
  }

  const now = new Date();
  // 放置された期限切れ PENDING 行の掃除（1日以上前のもの）
  await prisma.kioskDevice.deleteMany({
    where: {
      status: "PENDING",
      registrationExpiresAt: {
        lt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      },
    },
  });
  const device = await prisma.kioskDevice.create({
    data: {
      status: "PENDING",
      registrationCode: generateCode(REGISTRATION_CODE_LENGTH),
      registrationExpiresAt: new Date(now.getTime() + REGISTRATION_TTL_MS),
      userAgent: req.headers.get("user-agent"),
      lastIpAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
    select: { id: true, registrationCode: true, registrationExpiresAt: true },
  });

  return NextResponse.json({
    registered: false,
    deviceId: device.id,
    registrationCode: device.registrationCode,
    expiresAt: device.registrationExpiresAt,
  });
}

export async function GET() {
  // 登録状態の確認はアテステーション前でも可能（skipAttest）— 代わりに
  // attestation フィールドで「アテスト済みか」をクライアントへ返す。
  const device = await getDevice({ skipAttest: true });
  if (device.ok) {
    const attested = (await getDevice()).ok;
    return NextResponse.json({
      registered: true,
      deviceId: device.device.id,
      deviceName: device.device.name,
      attestation: { required: attestationRequired(), attested },
    });
  }
  return NextResponse.json({ registered: false, reason: device.reason });
}
