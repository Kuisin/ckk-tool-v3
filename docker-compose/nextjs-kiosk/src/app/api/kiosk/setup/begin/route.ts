/**
 * POST /api/kiosk/setup/begin — 端末リンクの開始（タブレット側でコード発行）。
 *
 * リンクリクエスト（kiosk_link_requests: 12桁コード・10分期限）を作成し、
 * /setup 画面が QR + テキストで表示する。管理者は SY09 でこのコードを
 * 入力/スキャンし、**オープン（PENDING）なプロファイルにのみ**リンクできる。
 * 成立はタブレットが /api/kiosk/setup/link-status でポーリング検知する。
 */

import { NextResponse } from "next/server";
import { generateCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { getDevice } from "@/lib/kiosk-auth";
import {
  LINK_REQUEST_TTL_MS,
  REGISTRATION_CODE_LENGTH,
} from "@/lib/kiosk-auth-core";

export async function POST(req: Request) {
  const existing = await getDevice({ skipAttest: true });
  if (existing.ok) {
    return NextResponse.json({
      status: "ALREADY_REGISTERED",
      deviceId: existing.device.id,
    });
  }

  const now = new Date();
  // 期限切れ・未リンクのリクエストを掃除（リンク済みはタブレットの
  // ポーリングが読むまで残す — TTL 超過後も無害）
  await prisma.kioskLinkRequest.deleteMany({
    where: { deviceId: null, expiresAt: { lt: now } },
  });

  const request = await prisma.kioskLinkRequest.create({
    data: {
      code: generateCode(REGISTRATION_CODE_LENGTH),
      expiresAt: new Date(now.getTime() + LINK_REQUEST_TTL_MS),
      userAgent: req.headers.get("user-agent"),
      lastIpAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
    select: { code: true, expiresAt: true },
  });

  return NextResponse.json({
    status: "WAITING",
    code: request.code,
    expiresAt: request.expiresAt,
  });
}
