/**
 * GET /api/kiosk/unlock-pin — メンテナンス退出 PIN の取得（端末 Cookie 認証）。
 *
 * PIN は全端末共通で system_settings（kiosk.unlock_pin）に保持され、
 * pg_cron が毎日 4:00 に自動更新する。専用アプリ（v0.5.3+）は 1 時間ごと +
 * メンテナンスダイアログ表示時にこれを取得してローカルに保存し、
 * BuildConfig の PIN はフォールバックとしてのみ使う。
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDevice } from "@/lib/kiosk-auth";

export async function GET() {
  const device = await getDevice();
  if (!device.ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const row = await prisma.systemSetting.findUnique({
    where: { key: "kiosk.unlock_pin" },
  });
  const pin = typeof row?.value === "string" ? row.value : null;
  if (!pin) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, pin });
}
