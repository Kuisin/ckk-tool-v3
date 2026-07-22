import "server-only";

/**
 * oidc.ts — 自前の Authentik OIDC（Authorization Code + PKCE）クライアント。
 *
 * Auth.js v5-beta の OAuth コールバックが http issuer + TLS プロキシ + VPN 経路で
 * 完了しないため、認可コードフローを最小実装で自作する（依存追加なし: fetch +
 * node:crypto）。トークン交換はサーバー→Authentik（VPN 経由・信頼路）で行い、
 * userinfo からクレームを取得。セッションは Auth.js と同じ JWT cookie を発行する
 * （lib の encode）。純粋に server 側でのみ使用。
 */

import crypto from "node:crypto";

export interface OidcConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  issuer: string;
}

let cached: { at: number; cfg: OidcConfig } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h

/** discovery（.well-known）を取得・キャッシュ。issuer 末尾スラッシュを吸収。 */
export async function getOidcConfig(): Promise<OidcConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.cfg;
  const issuer = (process.env.AUTH_AUTHENTIK_ISSUER ?? "").replace(/\/?$/, "/");
  const res = await fetch(`${issuer}.well-known/openid-configuration`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: ${res.status}`);
  }
  const cfg = (await res.json()) as OidcConfig;
  cached = { at: Date.now(), cfg };
  return cfg;
}

/** アプリのコールバック URL（Authentik に登録が必要）。 */
export function redirectUri(): string {
  return `${process.env.AUTH_URL}/api/oidc/callback`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** PKCE: verifier → S256 challenge。 */
export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export interface OidcClaims {
  sub?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  [k: string]: unknown;
}

/** 認可コード → トークン（サーバー→Authentik、client_secret 付き）。 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<{ access_token: string; id_token?: string }> {
  const cfg = await getOidcConfig();
  const res = await fetch(cfg.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: codeVerifier,
      client_id: process.env.AUTH_AUTHENTIK_ID ?? "",
      client_secret: process.env.AUTH_AUTHENTIK_SECRET ?? "",
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { access_token: string; id_token?: string };
}

/** userinfo からクレーム取得（access_token）。 */
export async function fetchUserinfo(accessToken: string): Promise<OidcClaims> {
  const cfg = await getOidcConfig();
  const res = await fetch(cfg.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`userinfo failed: ${res.status}`);
  }
  return (await res.json()) as OidcClaims;
}
