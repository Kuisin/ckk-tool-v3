/**
 * tickets.ts — PIN 設定/検証用の単回チケット（メモリ保持）。
 *
 * QR スキャン成功 → PIN 入力の 2 リクエスト間で card/device の組を固定し、
 * 別カードへのリプレイを防ぐ。単一インスタンス前提（nextjs-web の
 * インメモリレートリミッタと同じ割り切り）。TTL 2分・使用で削除。
 */

import { randomBytes } from "node:crypto";
import {
  PIN_TICKET_WINDOW_MS,
  TICKET_TTL_MS,
  withinPinTicketLimit,
} from "./kiosk-auth-core";

// DEVICE_SETTINGS は端末設定（/device-settings）の解錠 → リセット実行間の
// 継続証明。card は関与しないので cardId は "" を渡す。
// REACTIVATE は Cookie 消失時の端末トークン再発行で、端末鍵に署名させる nonce。
// card は関与しないので cardId は ""。
export type TicketPurpose =
  | "PIN_SETUP"
  | "PIN_VERIFY"
  | "ATTEST"
  | "DEVICE_SETTINGS"
  | "REACTIVATE";

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

// ── PIN_VERIFY チケットの発行レート制限（カード単位・インメモリ）─────────────
// ロック窓（15分）で撃てる照合は PIN_MAX_ATTEMPTS 回までなので、それを超えて
// 1 枚のカードに PIN_VERIFY チケットを出しても、攻撃者が「同時撃ち」用に
// 溜め込めるだけ。カードごとに直近の発行時刻（epoch ms）を持ち、窓内の本数が
// 上限に達したら発行しない。**単一インスタンス前提** — 複数レプリカでは各
// プロセスが別カウントになる（上のチケットストアと同じ割り切り。真の上限は
// DB 側のロック /api/kiosk/pin が担保しており、これは前段の緩和）。
const globalPinTicketLog = globalThis as unknown as {
  __kioskPinTicketLog?: Map<string, number[]>;
};
if (!globalPinTicketLog.__kioskPinTicketLog) {
  globalPinTicketLog.__kioskPinTicketLog = new Map<string, number[]>();
}
const pinTicketLog = globalPinTicketLog.__kioskPinTicketLog;

/**
 * PIN_VERIFY チケットを 1 枚発行する。カード単位のレート上限
 * （kiosk-auth-core.withinPinTicketLimit）内なら発行して時刻を記録し、超えて
 * いれば **null を返して発行しない**（呼び出し側はロック扱いで弾く）。
 */
export function issuePinVerifyTicket(
  cardId: string,
  deviceId: string,
  now: Date = new Date(),
): string | null {
  const cutoff = now.getTime() - PIN_TICKET_WINDOW_MS;
  const recent = (pinTicketLog.get(cardId) ?? []).filter((t) => t > cutoff);
  if (!withinPinTicketLimit(now, recent)) {
    pinTicketLog.set(cardId, recent); // 窓外を落としつつ据え置き
    return null;
  }
  const token = issueTicket(cardId, deviceId, "PIN_VERIFY");
  recent.push(now.getTime());
  pinTicketLog.set(cardId, recent);
  // 使われなくなったカードのエントリを間引く（無制限に増やさない）
  if (pinTicketLog.size > 500) {
    for (const [k, v] of pinTicketLog) {
      const live = v.filter((t) => t > cutoff);
      if (live.length === 0) pinTicketLog.delete(k);
      else pinTicketLog.set(k, live);
    }
  }
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
