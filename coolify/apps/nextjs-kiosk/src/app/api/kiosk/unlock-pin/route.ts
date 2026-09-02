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
import { attestSecret } from "@/lib/attest-core";
import { prisma } from "@/lib/db";
import { getDevice } from "@/lib/kiosk-auth";
import {
  attemptContext,
  deny,
  denyDevice,
  recordKioskFailure,
} from "@/lib/kiosk-login-log";

export async function GET(req: Request) {
  const device = await getDevice();
  if (!device.ok) {
    return denyDevice(attemptContext(req, null), device.reason, "DEVICE_LINK");
  }
  const ctx = attemptContext(req, device.device);
  // **端末 Cookie だけでは渡さない。** この PIN は全端末共通で Android の設定
  // 画面を開く鍵なので、Web 側（SY09）では承認つきの特権操作にしてある。
  // 端末側は「専用アプリが端末鍵で署名した証拠（attest Cookie, 12h）」を
  // 持つ相手にだけ渡す。ブラウザでタブレットの Cookie を使い回しても、
  // 盗まれた端末 UUID から H2 の経路でトークンを取っても、ここは通らない。
  // 専用アプリの PinSync は WebView の Cookie をそのまま送るので、ログイン
  // 画面のアテステーションを通った端末は従来どおり受け取れる。
  if (!attestSecret()) {
    recordKioskFailure(ctx, "ATTEST_NOT_CONFIGURED", { method: "DEVICE_LINK" });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (!device.device.attested) {
    return deny(ctx, "NOT_ATTESTED", 403, { method: "DEVICE_LINK" });
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
