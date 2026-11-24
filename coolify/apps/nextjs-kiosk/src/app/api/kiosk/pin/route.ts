/**
 * POST /api/kiosk/pin — PIN の初回設定 / 照合（/api/qr/access のチケット必須）。
 *
 *   { ticket, purpose: "PIN_SETUP",  pin } — 初回設定 → 即ログイン
 *   { ticket, purpose: "PIN_VERIFY", pin } — 照合 → ログイン。
 *     5 連続失敗で 15 分ロック（kiosk-auth-core.nextPinFailureState）。
 *
 * 成功も失敗も認証イベント（app.login_attempts）に残す。従来は PIN 誤りで
 * kiosk_cards のカウンタが進むだけで、ロックが明けたら痕跡が消えていた。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, getDevice } from "@/lib/kiosk-auth";
import {
  isCardWithinValidPeriod,
  isPinLocked,
  isValidPin,
  newPinVerdict,
  PIN_MAX_ATTEMPTS,
  pinFailureStateAfter,
} from "@/lib/kiosk-auth-core";
import {
  attemptContext,
  deny,
  denyDevice,
  recordKioskSuccess,
} from "@/lib/kiosk-login-log";
import type { LoginMethod } from "@/lib/login-attempt-core";
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
    return denyDevice(attemptContext(req, null), device.reason, "QR_PIN");
  }
  const ctx = attemptContext(req, device.device);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return deny(ctx, "BAD_REQUEST", 400, { method: "QR_PIN" });
  }
  const { ticket, purpose, pin } = parsed.data;
  const method: LoginMethod = purpose === "PIN_SETUP" ? "PIN_SETUP" : "QR_PIN";

  if (!isValidPin(pin)) {
    return deny(ctx, "PIN_FORMAT", 400, { method });
  }
  // 初回設定は 6 桁 + 弱い並びを弾く（既存 PIN の照合は従来の 4〜6 桁のまま）。
  if (purpose === "PIN_SETUP" && newPinVerdict(pin) !== "OK") {
    return deny(ctx, "PIN_WEAK", 400, { method });
  }

  const consumed = consumeTicket(ticket, purpose, device.device.id);
  if (!consumed) {
    // チケット期限切れ / 別端末 — スキャンからやり直し
    return deny(ctx, "TICKET_EXPIRED", 410, { method });
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
    return deny(ctx, "CARD_INVALID", 404, {
      method,
      cardId: card?.id ?? null,
      userId: card?.user?.id ?? null,
    });
  }

  const detail = { method, cardId: card.id, userId: card.user.id };
  const now = new Date();

  // テンポラリカードの有効期間外（スキャン後に期限を跨いだ場合もここで弾く）
  if (!isCardWithinValidPeriod(now, card.validFrom, card.validUntil)) {
    return deny(ctx, "CARD_EXPIRED", 403, detail);
  }

  if (purpose === "PIN_SETUP") {
    if (card.pinHash) {
      // 既に設定済み（並行スキャン等）— 照合フローへ誘導
      return deny(ctx, "PIN_ALREADY_SET", 409, detail);
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
    recordKioskSuccess(ctx, detail);
    // userId はクライアントの「最後に開いたページ」復元（localStorage キー）用
    return NextResponse.json({ state: "OK", userId: card.user.id });
  }

  // PIN_VERIFY
  if (!card.pinHash) {
    return deny(ctx, "CARD_INVALID", 404, detail);
  }
  // 読んだ時点のスナップショットでの早期弾き（通常の「ロック中に再試行」経路）。
  if (isPinLocked(now, card.pinLockedUntil)) {
    return deny(ctx, "LOCKED", 429, detail, { until: card.pinLockedUntil });
  }

  // 照合の前に「試行枠」を 1 つ atomically に確保する。これが同時撃ちの肝:
  // チケットを N 枚先に仕込んで N 本同時に撃っても、この単一 UPDATE が
  // Postgres 側で直列化され、pinFailedAttempts < PIN_MAX_ATTEMPTS を満たす
  // 先頭 PIN_MAX_ATTEMPTS 本だけが枠を取れる（= verifyPin に到達できる）。
  // 残りは count=0 で弾かれ照合に進めない。従来は verify の後に increment して
  // いたため、ロックが書かれる前に読んだスナップショット（上の isPinLocked）を
  // 全員が素通りし、1 窓で上限を超えて試せた。ロック中（pinLockedUntil が未来）の
  // 行には枠を出さず、期限切れのロック時刻は「<= now」で枠を許して新しい窓を開く。
  const claim = await prisma.kioskCard.updateMany({
    where: {
      id: card.id,
      pinFailedAttempts: { lt: PIN_MAX_ATTEMPTS },
      OR: [{ pinLockedUntil: null }, { pinLockedUntil: { lte: now } }],
    },
    data: { pinFailedAttempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    // 枠を取れなかった = 同時の失敗が先にロックした / 上限に達した。いずれも
    // 「この窓ではこれ以上試させない」= ロック扱いで弾く（照合はしない）。
    const fresh = await prisma.kioskCard.findUnique({
      where: { id: card.id },
      select: { pinLockedUntil: true },
    });
    return deny(ctx, "LOCKED", 429, detail, {
      until: fresh?.pinLockedUntil ?? null,
    });
  }

  if (!verifyPin(pin, card.pinHash)) {
    // claim で既に +1 済み。加算後の値からロックの要否を決める。
    const after = await prisma.kioskCard.findUnique({
      where: { id: card.id },
      select: { pinFailedAttempts: true },
    });
    const next = pinFailureStateAfter(
      now,
      after?.pinFailedAttempts ?? PIN_MAX_ATTEMPTS,
    );
    if (next.lockedUntil) {
      // 上限到達。ロックは「まだロックされていない（期限切れ含む）」行にだけ
      // 書く — 同時失敗のうち先頭 1 本だけが実際に書き、後続は no-op。これで
      // 「別の失敗が既にロックした後に滑り込んで上書きする」ことを防ぐ。
      await prisma.kioskCard.updateMany({
        where: {
          id: card.id,
          OR: [{ pinLockedUntil: null }, { pinLockedUntil: { lte: now } }],
        },
        data: {
          pinFailedAttempts: next.failedAttempts,
          pinLockedUntil: next.lockedUntil,
        },
      });
      // 5 連続失敗の到達点。理由は LOCKED だが、直前の 5 行が PIN_MISMATCH
      // として残っているので、後から経緯が追える。
      return deny(ctx, "LOCKED", 429, detail, { until: next.lockedUntil });
    }
    // 再試行用チケットを発行し直す（スキャンからやり直させない）
    const retry = issueTicket(card.id, device.device.id, "PIN_VERIFY");
    return deny(ctx, "PIN_MISMATCH", 401, detail, { ticket: retry });
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
  recordKioskSuccess(ctx, detail);
  return NextResponse.json({ state: "OK", userId: card.user.id });
}
