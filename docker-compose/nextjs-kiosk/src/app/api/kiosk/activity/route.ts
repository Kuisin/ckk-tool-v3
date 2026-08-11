/**
 * POST /api/kiosk/activity — アイドルタイマーの延命 ping（ActivityMonitor から
 * 最短 30 秒間隔）。セッションと端末の lastActivityAt を進め、残り時間を返す。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/kiosk-auth";
import { IDLE_TIMEOUT_MS } from "@/lib/kiosk-auth-core";
import { wsBridge } from "@/lib/ws-bridge";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const now = new Date();
  await prisma.kioskSession.update({
    where: { id: session.sessionId },
    data: { lastActivityAt: now },
  });
  await prisma.kioskDevice.update({
    where: { id: session.deviceId },
    data: { lastActivityAt: now },
  });
  wsBridge()?.notifyActivity(session.deviceId);
  return NextResponse.json({
    authenticated: true,
    idleRemainingMs: IDLE_TIMEOUT_MS,
    expiresAt: session.expiresAt,
  });
}
