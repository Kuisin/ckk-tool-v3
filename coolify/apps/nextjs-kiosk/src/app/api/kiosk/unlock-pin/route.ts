/**
 * GET /api/kiosk/unlock-pin — メンテナンス退出 PIN の取得（端末 Cookie 認証）。
 *
 * PIN は全端末共通で system_settings（kiosk.unlock_pin）に保持され、
 * pg_cron が毎日 4:00 に自動更新する。専用アプリ（v0.5.3+）は 1 時間ごと +
 * メンテナンスダイアログ表示時にこれを取得してローカルに保存し、
 * BuildConfig の PIN はフォールバックとしてのみ使う。
 *
 * 渡せたときは端末行に**受け渡しの記録**を残す（unlock_pin_synced_at と、
 * 渡した PIN の rotated_at）。端末はローカルに PIN を持つので、これが無いと
 * 管理側から「その端末がいま何を保持しているか」を決められない。401/404 では
 * 書かない — 端末は受け取れていないので、それが正しく「未同期」として残る。
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
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });
  const pin = typeof row.value === "string" ? row.value : null;
  if (!pin) return NextResponse.json({ ok: false }, { status: 404 });

  // 記録に失敗しても PIN は返す — 端末を締め出さないことを優先する
  try {
    await prisma.kioskDevice.update({
      where: { id: device.device.id },
      data: {
        unlockPinSyncedAt: new Date(),
        unlockPinRotatedAt: row.updatedAt,
      },
    });
  } catch {
    // 記録できなくても配布は続ける（次の同期で埋まる）
  }

  return NextResponse.json({ ok: true, pin });
}
