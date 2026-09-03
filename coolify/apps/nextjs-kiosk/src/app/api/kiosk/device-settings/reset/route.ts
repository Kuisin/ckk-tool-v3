/**
 * POST /api/kiosk/device-settings/reset — 端末のリセット/再リンク（要チケット）。
 *
 * verify 成功時の単回チケット（DEVICE_SETTINGS・2分）を消費して実行する。
 *   mode "local"  — 端末ローカルの信頼のみ破棄（Cookie 削除）。DB のプロファイル
 *                   は LINKED/ACTIVE のまま — 再リンクには SY09 の「リンク解除」
 *                   が必要（UI 側で警告する）。
 *   mode "unlink" — サーバー側もリンク解除（SY09 unlinkDevice と同セマンティクス:
 *                   PENDING に戻しトークン/鍵/セッションを破棄）。プロファイルは
 *                   オープンに戻り、/setup の新コードで再リンクできる。
 * どちらも実行後は端末を /setup 相当の初期状態にする（クライアントが
 * localStorage の kiosk_device_id も消す）。
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ATTEST_COOKIE } from "@/lib/attest-core";
import { prisma } from "@/lib/db";
import { encodeInventoryNote } from "@/lib/inventory-note-core";
import {
  DEVICE_COOKIE,
  destroySession,
  getDeviceForSettings,
} from "@/lib/kiosk-auth";
import { consumeTicket } from "@/lib/tickets";
import { wsBridge } from "@/lib/ws-bridge";

const bodySchema = z.object({
  ticket: z.string().min(1),
  mode: z.enum(["local", "unlink"]),
});

export async function POST(req: Request) {
  const device = await getDeviceForSettings();
  if (!device) {
    return NextResponse.json({ state: "NO_DEVICE" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (!consumeTicket(parsed.data.ticket, "DEVICE_SETTINGS", device.id)) {
    // チケット期限切れ（2分）・二重実行 — 再度コード入力から
    return NextResponse.json({ state: "TICKET_INVALID" }, { status: 403 });
  }

  // ログイン中ならまずログアウト（LOGOUT ログ + モニター通知込み）
  await destroySession();

  if (parsed.data.mode === "unlink") {
    const now = new Date();
    const openSessions = await prisma.kioskSession.findMany({
      where: { deviceId: device.id, revokedAt: null },
      select: { userId: true },
    });
    await prisma.$transaction([
      prisma.kioskDevice.update({
        where: { id: device.id },
        data: {
          status: "PENDING",
          linkedAt: null,
          deviceTokenHash: null,
          deviceTokenExpiresAt: null,
          devicePublicKey: null,
          fingerprint: null,
          userAgent: null,
          lastIpAddress: null,
        },
      }),
      prisma.kioskSession.updateMany({
        where: { deviceId: device.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      prisma.kioskDeviceLog.createMany({
        data: openSessions.map((s) => ({
          deviceId: device.id,
          type: "LOGOUT" as const,
          userId: s.userId,
          source: "reset",
        })),
      }),
      prisma.kioskLinkRequest.deleteMany({ where: { deviceId: device.id } }),
    ]);
    // 監査: 端末側操作なので actor なし（設定コード認証済みであることを注記）
    await prisma.auditLog
      .create({
        data: {
          userId: null,
          action: "UPDATE",
          tableName: "kiosk_devices",
          recordId: device.id,
          beforeData: { status: device.status },
          afterData: {
            status: "PENDING",
            note: encodeInventoryNote("deviceUnlinkedFromDevice"),
          },
        },
      })
      .catch(() => undefined);
    wsBridge()?.notifyDeviceChanged(device.id);
  }

  // 端末ローカルの信頼を破棄（両モード共通）
  const store = await cookies();
  store.delete(DEVICE_COOKIE);
  store.delete(ATTEST_COOKIE);

  return NextResponse.json({ state: "OK" });
}
