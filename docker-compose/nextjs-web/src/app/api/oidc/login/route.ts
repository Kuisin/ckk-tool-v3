import { type NextRequest, NextResponse } from "next/server";
import {
  getOidcConfig,
  pkceChallenge,
  randomToken,
  redirectUri,
} from "@/lib/oidc";

export const dynamic = "force-dynamic";

/** 一時 cookie（state / nonce / verifier）。/api/oidc 配下のみ・短命。 */
const TMP_COOKIE = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/api/oidc",
  maxAge: 600,
};

/** SSO 開始 — Authentik の認可画面へリダイレクト（PKCE + state）。 */
export async function GET(_req: NextRequest) {
  const cfg = await getOidcConfig();
  const state = randomToken(16);
  const nonce = randomToken(16);
  const verifier = randomToken(32);

  const url = new URL(cfg.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.AUTH_AUTHENTIK_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("oidc_state", state, TMP_COOKIE);
  res.cookies.set("oidc_nonce", nonce, TMP_COOKIE);
  res.cookies.set("oidc_verifier", verifier, TMP_COOKIE);
  return res;
}
