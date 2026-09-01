/**
 * POST /api/display/setup/begin — リンクの開始（画面側でコード発行）。
 *
 * キオスク端末の /api/kiosk/setup/begin と**同じ形**。リンクリクエスト
 * （display_link_requests: 12桁・10分）を作り、/display が QR + テキストで
 * 表示する。管理者は SY09 でこのコードを入力/スキャンし、**オープン
 * （PENDING）なプロファイルにのみ**リンクできる。
 *
 * 成立は /api/display/setup/link-status のポーリングで検知する。
 * 期限切れ行の掃除もここで行う（pg_cron を増やさない）。
 */

import { NextResponse } from "next/server";
import { generateCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { getDisplay } from "@/lib/display-auth";
import {
  displayRegistrationBlocked,
  LINK_CODE_LENGTH,
  LINK_REQUEST_TTL_MS,
  normalizeScreenIndex,
} from "@/lib/display-core";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 窓ごとに別の Cookie（同じブラウザの 2 枚目は別の登録として扱う）
  const screen = normalizeScreenIndex(
    new URL(req.url).searchParams.get("screen"),
  );
  const existing = await getDisplay(screen);
  if (existing.ok) {
    return NextResponse.json({
      status: "ALREADY_REGISTERED",
      deviceId: existing.display.id,
    });
  }
  // 止められている画面には新しいコードを出さない（端末側と同じ理由 —
  // 停止の迂回と、同じ実機のプロファイルの二重化を防ぐ）。
  if (displayRegistrationBlocked(existing.reason)) {
    return NextResponse.json({ status: "BLOCKED", reason: existing.reason });
  }

  const now = new Date();
  // 期限切れ・未リンクのリクエストを掃除（リンク済みは画面のポーリングが
  // 読むまで残す — TTL 超過後も無害）
  await prisma.displayLinkRequest.deleteMany({
    where: { deviceId: null, expiresAt: { lt: now } },
  });

  const request = await prisma.displayLinkRequest.create({
    data: {
      code: generateCode(LINK_CODE_LENGTH),
      expiresAt: new Date(now.getTime() + LINK_REQUEST_TTL_MS),
      // 左端（クライアント自称）ではなく信頼できるプロキシが観測した値
      userAgent: userAgentOf(req),
      lastIpAddress: clientIpOf(req),
    },
    select: { code: true, expiresAt: true },
  });

  return NextResponse.json({
    status: "WAITING",
    code: request.code,
    expiresAt: request.expiresAt,
  });
}
