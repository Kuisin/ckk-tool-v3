/**
 * GET /api/kiosk/session — セッション検証（クライアント初期化用）。
 * DELETE — ログアウト。
 */

import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/kiosk-auth";
import { idleRemainingMs } from "@/lib/kiosk-auth-core";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    displayName: session.displayName,
    username: session.username,
    locale: session.locale,
    expiresAt: session.expiresAt,
    idleRemainingMs: idleRemainingMs(new Date(), session.lastActivityAt),
  });
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
