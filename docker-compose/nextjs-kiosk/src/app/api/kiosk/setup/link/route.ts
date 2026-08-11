/**
 * POST /api/kiosk/setup/link — 端末をプロファイルへリンク。
 *
 * 新フロー（profile-first）:
 *   1. 管理者が SY09 で端末プロファイルを作成 → リンクコード（12桁・24h）が
 *      Web 側に表示される
 *   2. タブレットの /setup がコードを入力/スキャンしてここへ POST
 *   3. プロファイルが LINKED になり（コードは null 化）、管理者は
 *      **リンク済みのプロファイルのみ** 有効化できる
 *   4. 有効化後、タブレットの confirm ポーリングがトークンを受け取る
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { getDevice } from "@/lib/kiosk-auth";
import {
  isRegistrationAlive,
  REGISTRATION_CODE_LENGTH,
} from "@/lib/kiosk-auth-core";

const bodySchema = z.object({ code: z.string().min(1).max(60) });

export async function POST(req: Request) {
  // 既に信頼済み端末なら何もしない
  const existing = await getDevice({ skipAttest: true });
  if (existing.ok) {
    return NextResponse.json({
      status: "ALREADY_REGISTERED",
      deviceId: existing.device.id,
    });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const code = normalizeCode(parsed.data.code);
  if (code.length !== REGISTRATION_CODE_LENGTH) {
    return NextResponse.json({ status: "CODE_INVALID" }, { status: 404 });
  }

  const profile = await prisma.kioskDevice.findUnique({
    where: { registrationCode: code },
    select: { id: true, name: true, status: true, registrationExpiresAt: true },
  });
  if (!profile || profile.status !== "PENDING") {
    return NextResponse.json({ status: "CODE_INVALID" }, { status: 404 });
  }
  if (!isRegistrationAlive(new Date(), profile.registrationExpiresAt)) {
    return NextResponse.json({ status: "CODE_EXPIRED" }, { status: 410 });
  }

  await prisma.kioskDevice.update({
    where: { id: profile.id },
    data: {
      status: "LINKED",
      linkedAt: new Date(),
      registrationCode: null,
      registrationExpiresAt: null,
      userAgent: req.headers.get("user-agent"),
      lastIpAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });

  return NextResponse.json({
    status: "LINKED",
    deviceId: profile.id,
    deviceName: profile.name,
  });
}
