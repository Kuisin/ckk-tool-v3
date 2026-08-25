/**
 * POST /api/qr/access — QR スキャンのログイン判定（計画の決定木そのまま）。
 *
 *   端末 Cookie 有効+ACTIVE → カード存在 → ASSIGNED → ユーザー有効 → 有効期間内 →
 *     1. PIN 未設定        → PIN_SETUP_REQUIRED（単回チケット）
 *     2. ロック中          → LOCKED
 *     3. **この端末で** 48h 以内に使用 かつ PIN 検証から 2 週間以内
 *        → セッション作成 → OK（スキャンのみ）
 *     4. それ以外          → PIN_REQUIRED（単回チケット）
 *
 * 端末単位の 48h 判定 = 同カード×同端末の最新セッションの活動時刻
 * （kiosk_sessions）。初めて使う端末では必ず PIN（カード盗難時に別端末で
 * スキャンだけで入られるのを防ぐ）。加えて活動が続いていても 2 週間ごとに
 * 必ず PIN を再要求する（needsPinVerify — kiosk-auth-core.ts）。
 *
 * カードの存在有無を漏らさないため、失敗系は同一メッセージの CARD_INVALID に
 * 集約する（SUSPENDED / 有効期間外の EXPIRED だけは利用者向けに区別 —
 * 管理者に連絡させるため）。**画面には出さない区別も認証イベント
 * （login_attempts）には残す** — 管理者が後から何が起きたか追えるように。
 *
 * PIN_REQUIRED / PIN_SETUP_REQUIRED は中間状態なので記録しない（結末は
 * /api/kiosk/pin が書く）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, getDevice } from "@/lib/kiosk-auth";
import {
  CARD_ID_LENGTH,
  extractCardId,
  isCardWithinValidPeriod,
  isPinLocked,
  needsPinVerify,
} from "@/lib/kiosk-auth-core";
import {
  attemptContext,
  deny,
  denyDevice,
  recordKioskSuccess,
} from "@/lib/kiosk-login-log";
import { clientIpOf, userAgentOf } from "@/lib/request-ip";
import { issueTicket } from "@/lib/tickets";
import { wsBridge } from "@/lib/ws-bridge";

const bodySchema = z.object({ cardId: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const device = await getDevice();
  if (!device.ok) {
    return denyDevice(attemptContext(req, null), device.reason, "QR_SCAN");
  }
  const ctx = attemptContext(req, device.device);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return deny(ctx, "BAD_REQUEST", 400, { method: "QR_SCAN" });
  }

  // 端末の生存を刻む（プレゼンス）。ついでに「最後に観測した」UA / IP も更新する
  // — 追加のクエリを増やさずに端末情報を新鮮に保てる。
  await prisma.kioskDevice.update({
    where: { id: device.device.id },
    data: {
      lastActivityAt: new Date(),
      lastIpAddress: clientIpOf(req),
      userAgent: userAgentOf(req),
    },
  });
  wsBridge()?.notifyActivity(device.device.id);

  const scanned = parsed.data.cardId;
  const cardId = extractCardId(scanned);
  if (cardId.length !== CARD_ID_LENGTH) {
    return deny(ctx, "CARD_INVALID", 404, { method: "QR_SCAN", scanned });
  }

  const card = await prisma.kioskCard.findUnique({
    where: { id: cardId },
    include: { user: { select: { id: true, isActive: true } } },
  });
  if (!card || !card.user || !card.user.isActive) {
    // 画面では区別しないが、記録には「実在するカードだったか」を残す
    return deny(ctx, "CARD_INVALID", 404, {
      method: "QR_SCAN",
      scanned,
      cardId: card?.id ?? null,
      userId: card?.user?.id ?? null,
    });
  }

  const detail = {
    method: "QR_SCAN" as const,
    scanned,
    cardId: card.id,
    userId: card.user.id,
  };

  if (card.status === "SUSPENDED") {
    return deny(ctx, "CARD_SUSPENDED", 403, detail);
  }
  if (card.status !== "ASSIGNED") {
    return deny(ctx, "CARD_INVALID", 404, detail);
  }

  const now = new Date();

  // テンポラリカードの有効期間外（利用者に管理者への連絡を促すため区別する）
  if (!isCardWithinValidPeriod(now, card.validFrom, card.validUntil)) {
    return deny(ctx, "CARD_EXPIRED", 403, detail);
  }

  // 1. PIN 未設定 → 初回設定を要求（結末は /api/kiosk/pin が記録する）
  if (!card.pinHash) {
    const ticket = issueTicket(card.id, device.device.id, "PIN_SETUP");
    return NextResponse.json({ state: "PIN_SETUP_REQUIRED", ticket });
  }
  // 2. ロック中
  if (isPinLocked(now, card.pinLockedUntil)) {
    return deny(ctx, "LOCKED", 429, detail, { until: card.pinLockedUntil });
  }
  // 3. この端末で 48h 以内に使用 + PIN 検証 2 週間以内 → スキャンのみでログイン
  const lastDeviceSession = await prisma.kioskSession.findFirst({
    where: { cardId: card.id, deviceId: device.device.id },
    orderBy: { lastActivityAt: "desc" },
    select: { lastActivityAt: true },
  });
  if (
    !needsPinVerify(
      now,
      lastDeviceSession?.lastActivityAt ?? null,
      card.pinLastVerifiedAt,
    )
  ) {
    await prisma.kioskCard.update({
      where: { id: card.id },
      data: { lastUsedAt: now, useCount: { increment: 1 } },
    });
    await createSession(card.user.id, card.id, device.device.id);
    recordKioskSuccess(ctx, detail);
    // userId はクライアントの「最後に開いたページ」復元（localStorage キー）用
    return NextResponse.json({ state: "OK", userId: card.user.id });
  }
  // 4. PIN 再入力（この端末で 48h 超過 / 初めて使う端末 / 2 週間経過）
  const ticket = issueTicket(card.id, device.device.id, "PIN_VERIFY");
  return NextResponse.json({ state: "PIN_REQUIRED", ticket });
}
