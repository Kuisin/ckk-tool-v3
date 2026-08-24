/**
 * kiosk-ws-token.ts — キオスク端末プレゼンス WS のモニタートークン発行。
 *
 * ※ TWIN FILE: coolify/apps/nextjs-kiosk/src/lib/ws-auth.ts と対の実装。
 *   変更時は両方を揃えること。形式: `<exp epoch ms>.<hmac-sha256 base64url>`。
 *
 * 共有シークレット KIOSK_WS_SECRET の HMAC 署名付き・短命（60s）トークン。
 * 管理 UI（SY09 端末管理）がこのトークンで
 * `wss://<kiosk-host>/api/kiosk/ws?token=…` に接続し、snapshot / device_status
 * メッセージを受信する。
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 60 * 1000;

function sign(secret: string, exp: string): string {
  return createHmac("sha256", secret).update(exp).digest("base64url");
}

export function mintMonitorToken(secret: string, now = Date.now()): string {
  const exp = String(now + TOKEN_TTL_MS);
  return `${exp}.${sign(secret, exp)}`;
}

export function verifyMonitorToken(
  secret: string,
  token: string,
  now = Date.now(),
): boolean {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < now) return false;
  const expected = Buffer.from(sign(secret, exp));
  const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
