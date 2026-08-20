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
 * 管理者に連絡させるため）。
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
import { issueTicket } from "@/lib/tickets";
import { wsBridge } from "@/lib/ws-bridge";

const bodySchema = z.object({ cardId: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const device = await getDevice();
  if (!device.ok) {
    return NextResponse.json(
      { state: "DEVICE_INVALID", reason: device.reason },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  // 端末の生存を刻む（プレゼンス）
  await prisma.kioskDevice.update({
    where: { id: device.device.id },
    data: { lastActivityAt: new Date() },
  });
  wsBridge()?.notifyActivity(device.device.id);

  const cardId = extractCardId(parsed.data.cardId);
  if (cardId.length !== CARD_ID_LENGTH) {
    return NextResponse.json({ state: "CARD_INVALID" }, { status: 404 });
  }

  const card = await prisma.kioskCard.findUnique({
    where: { id: cardId },
    include: { user: { select: { id: true, isActive: true } } },
  });
  if (!card || !card.user || !card.user.isActive) {
    return NextResponse.json({ state: "CARD_INVALID" }, { status: 404 });
  }
  if (card.status === "SUSPENDED") {
    return NextResponse.json({ state: "CARD_SUSPENDED" }, { status: 403 });
  }
  if (card.status !== "ASSIGNED") {
    return NextResponse.json({ state: "CARD_INVALID" }, { status: 404 });
  }

  const now = new Date();

  // テンポラリカードの有効期間外（利用者に管理者への連絡を促すため区別する）
  if (!isCardWithinValidPeriod(now, card.validFrom, card.validUntil)) {
    return NextResponse.json({ state: "CARD_EXPIRED" }, { status: 403 });
  }

  // 1. PIN 未設定 → 初回設定を要求
  if (!card.pinHash) {
    const ticket = issueTicket(card.id, device.device.id, "PIN_SETUP");
    return NextResponse.json({ state: "PIN_SETUP_REQUIRED", ticket });
  }
  // 2. ロック中
  if (isPinLocked(now, card.pinLockedUntil)) {
    return NextResponse.json(
      { state: "LOCKED", until: card.pinLockedUntil },
      { status: 429 },
    );
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
    // userId はクライアントの「最後に開いたページ」復元（localStorage キー）用
    return NextResponse.json({ state: "OK", userId: card.user.id });
  }
  // 4. PIN 再入力（この端末で 48h 超過 / 初めて使う端末 / 2 週間経過）
  const ticket = issueTicket(card.id, device.device.id, "PIN_VERIFY");
  return NextResponse.json({ state: "PIN_REQUIRED", ticket });
}
