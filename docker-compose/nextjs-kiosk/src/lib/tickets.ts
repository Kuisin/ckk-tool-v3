/**
 * tickets.ts — PIN 設定/検証用の単回チケット（メモリ保持）。
 *
 * QR スキャン成功 → PIN 入力の 2 リクエスト間で card/device の組を固定し、
 * 別カードへのリプレイを防ぐ。単一インスタンス前提（nextjs-web の
 * インメモリレートリミッタと同じ割り切り）。TTL 2分・使用で削除。
 */

import { randomBytes } from "node:crypto";
import { TICKET_TTL_MS } from "./kiosk-auth-core";

export type TicketPurpose = "PIN_SETUP" | "PIN_VERIFY" | "ATTEST";

type Ticket = {
  cardId: string;
  deviceId: string;
  purpose: TicketPurpose;
  expiresAt: number;
};

const globalTickets = globalThis as unknown as {
  __kioskTickets?: Map<string, Ticket>;
};
if (!globalTickets.__kioskTickets) {
  globalTickets.__kioskTickets = new Map<string, Ticket>();
}
const store = globalTickets.__kioskTickets;

export function issueTicket(
  cardId: string,
  deviceId: string,
  purpose: TicketPurpose,
): string {
  // 期限切れの掃除（呼び出し頻度が低いのでここで十分）
  const now = Date.now();
  for (const [k, t] of store) {
    if (t.expiresAt <= now) store.delete(k);
  }
  const token = randomBytes(24).toString("base64url");
  store.set(token, {
    cardId,
    deviceId,
    purpose,
    expiresAt: now + TICKET_TTL_MS,
  });
  return token;
}

/** 取得と同時に無効化（単回使用）。 */
export function consumeTicket(
  token: string,
  purpose: TicketPurpose,
  deviceId: string,
): { cardId: string } | null {
  const t = store.get(token);
  if (!t) return null;
  store.delete(token);
  if (t.purpose !== purpose) return null;
  if (t.deviceId !== deviceId) return null;
  if (t.expiresAt <= Date.now()) return null;
  return { cardId: t.cardId };
}
