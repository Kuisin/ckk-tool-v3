/**
 * POST /api/kiosk/pin — PIN の初回設定 / 照合（/api/qr/access のチケット必須）。
 *
 *   { ticket, purpose: "PIN_SETUP",  pin } — 初回設定 → 即ログイン
 *   { ticket, purpose: "PIN_VERIFY", pin } — 照合 → ログイン。
 *     5 連続失敗で 15 分ロック（kiosk-auth-core.nextPinFailureState）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, getDevice } from "@/lib/kiosk-auth";
import {
  isCardWithinValidPeriod,
  isPinLocked,
  isValidPin,
  nextPinFailureState,
} from "@/lib/kiosk-auth-core";
import { hashPin, verifyPin } from "@/lib/pin";
import { consumeTicket, issueTicket } from "@/lib/tickets";

const bodySchema = z.object({
  ticket: z.string().min(1),
  purpose: z.enum(["PIN_SETUP", "PIN_VERIFY"]),
  pin: z.string().min(1).max(10),
});

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
  const { ticket, purpose, pin } = parsed.data;

  if (!isValidPin(pin)) {
    return NextResponse.json({ state: "PIN_FORMAT" }, { status: 400 });
  }

  const consumed = consumeTicket(ticket, purpose, device.device.id);
  if (!consumed) {
    // チケット期限切れ / 別端末 — スキャンからやり直し
    return NextResponse.json({ state: "TICKET_EXPIRED" }, { status: 410 });
  }

  const card = await prisma.kioskCard.findUnique({
    where: { id: consumed.cardId },
    include: { user: { select: { id: true, isActive: true } } },
  });
  if (
    !card ||
    !card.user ||
    !card.user.isActive ||
    card.status !== "ASSIGNED"
  ) {
    return NextResponse.json({ state: "CARD_INVALID" }, { status: 404 });
  }

  const now = new Date();

  // テンポラリカードの有効期間外（スキャン後に期限を跨いだ場合もここで弾く）
  if (!isCardWithinValidPeriod(now, card.validFrom, card.validUntil)) {
    return NextResponse.json({ state: "CARD_EXPIRED" }, { status: 403 });
  }

  if (purpose === "PIN_SETUP") {
    if (card.pinHash) {
      // 既に設定済み（並行スキャン等）— 照合フローへ誘導
      return NextResponse.json({ state: "PIN_ALREADY_SET" }, { status: 409 });
    }
    await prisma.kioskCard.update({
      where: { id: card.id },
      data: {
        pinHash: hashPin(pin),
        pinSetAt: now,
        pinLastVerifiedAt: now,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        lastUsedAt: now,
        useCount: { increment: 1 },
      },
    });
    await createSession(card.user.id, card.id, device.device.id);
    // userId はクライアントの「最後に開いたページ」復元（localStorage キー）用
    return NextResponse.json({ state: "OK", userId: card.user.id });
  }

  // PIN_VERIFY
  if (!card.pinHash) {
    return NextResponse.json({ state: "CARD_INVALID" }, { status: 404 });
  }
  if (isPinLocked(now, card.pinLockedUntil)) {
    return NextResponse.json(
      { state: "LOCKED", until: card.pinLockedUntil },
      { status: 429 },
    );
  }

  if (!verifyPin(pin, card.pinHash)) {
    const next = nextPinFailureState(now, card.pinFailedAttempts);
    await prisma.kioskCard.update({
      where: { id: card.id },
      data: {
        pinFailedAttempts: next.failedAttempts,
        pinLockedUntil: next.lockedUntil,
      },
    });
    if (next.lockedUntil) {
      return NextResponse.json(
        { state: "LOCKED", until: next.lockedUntil },
        { status: 429 },
      );
    }
    // 再試行用チケットを発行し直す（スキャンからやり直させない）
    const retry = issueTicket(card.id, device.device.id, "PIN_VERIFY");
    return NextResponse.json(
      { state: "PIN_MISMATCH", ticket: retry },
      { status: 401 },
    );
  }

  await prisma.kioskCard.update({
    where: { id: card.id },
    data: {
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      pinLastVerifiedAt: now,
      lastUsedAt: now,
      useCount: { increment: 1 },
    },
  });
  await createSession(card.user.id, card.id, device.device.id);
  return NextResponse.json({ state: "OK", userId: card.user.id });
}
