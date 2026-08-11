/**
 * ws-auth.ts — 管理 UI（nextjs-web）用モニタートークン。
 *
 * 共有シークレット KIOSK_WS_SECRET の HMAC 署名付き・短命（60s）トークン。
 * nextjs-web 側の発行コード（src/lib/kiosk-ws-token.ts）と対の実装 — 変更時は
 * 両方を揃えること。形式: `<exp epoch ms>.<hmac-sha256 base64url>`。
 *
 * ※ Next 依存なし（カスタムサーバー tsconfig.server.json からもコンパイル）。
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
