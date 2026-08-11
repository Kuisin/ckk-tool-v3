/**
 * POST /api/qr/access — QR スキャンのログイン判定（計画の決定木そのまま）。
 *
 *   端末 Cookie 有効+ACTIVE → カード存在 → ASSIGNED → ユーザー有効 →
 *     1. PIN 未設定        → PIN_SETUP_REQUIRED（単回チケット）
 *     2. ロック中          → LOCKED
 *     3. 3日以内に使用     → セッション作成 → OK
 *     4. それ以外          → PIN_REQUIRED（単回チケット）
 *
 * カードの存在有無を漏らさないため、失敗系は同一メッセージの CARD_INVALID に
 * 集約する（SUSPENDED だけは利用者向けに区別 — 管理者に連絡させるため）。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { createSession, getDevice } from "@/lib/kiosk-auth";
import {
  CARD_ID_LENGTH,
  isPinLocked,
  needsPinVerify,
} from "@/lib/kiosk-auth-core";
import { issueTicket } from "@/lib/tickets";
import { wsBridge } from "@/lib/ws-bridge";

const bodySchema = z.object({ cardId: z.string().min(1).max(200) });

/** QR ペイロード（カード ID そのもの / URL 形式の ?secret= / 末尾セグメント）からカード ID を抽出。 */
function extractCardId(payload: string): string {
  const trimmed = payload.trim();
  try {
    const url = new URL(trimmed);
    const secret =
      url.searchParams.get("secret") ?? url.pathname.split("/").pop() ?? "";
    return normalizeCode(secret);
  } catch {
    return normalizeCode(trimmed);
  }
}

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
  // 3. 3日以内の使用 → スキャンのみでログイン
  if (!needsPinVerify(now, card.lastUsedAt)) {
    await prisma.kioskCard.update({
      where: { id: card.id },
      data: { lastUsedAt: now, useCount: { increment: 1 } },
    });
    await createSession(card.user.id, card.id, device.device.id);
    return NextResponse.json({ state: "OK" });
  }
  // 4. PIN 再入力
  const ticket = issueTicket(card.id, device.device.id, "PIN_VERIFY");
  return NextResponse.json({ state: "PIN_REQUIRED", ticket });
}
