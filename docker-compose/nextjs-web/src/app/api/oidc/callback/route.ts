import { type NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { exchangeCode, fetchUserinfo } from "@/lib/oidc";

export const dynamic = "force-dynamic";

// Auth.js の JWT セッション cookie 名（AUTH_URL=https → __Secure- プレフィックス）。
// encode の salt はこの cookie 名（middleware の decode と一致させる）。
const SESSION_COOKIE = "__Secure-authjs.session-token";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30d（Auth.js 既定）

/** Authentik からのコールバック — コード検証→トークン→userinfo→セッション発行。 */
export async function GET(req: NextRequest) {
  const base = process.env.AUTH_URL ?? new URL(req.url).origin;
  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/login?error=${reason}`);

  const url = new URL(req.url);
  const providerError = url.searchParams.get("error");
  if (providerError) {
    console.error("[oidc] provider returned error:", providerError);
    return fail("OAuthCallbackError");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("oidc_state")?.value;
  const verifier = req.cookies.get("oidc_verifier")?.value;

  // CSRF: state 一致 + PKCE verifier の存在。
  if (!code || !state || !cookieState || state !== cookieState || !verifier) {
    console.error("[oidc] state/verifier check failed", {
      hasCode: !!code,
      hasState: !!state,
      stateMatch: state === cookieState,
      hasVerifier: !!verifier,
    });
    return fail("OAuthCallbackError");
  }

  try {
    const tokens = await exchangeCode(code, verifier);
    const claims = await fetchUserinfo(tokens.access_token);
    const username =
      claims.preferred_username ?? claims.email ?? claims.name ?? claims.sub;
    if (!username) {
      console.error("[oidc] no username claim; keys=", Object.keys(claims));
      return fail("AccessDenied");
    }

    const row = await prisma.user.upsert({
      where: { username },
      create: {
        group: "EMPLOYEE",
        username,
        displayName: claims.name ?? username,
        email: claims.email ?? null,
        isActive: true,
      },
      update: { lastLoginAt: new Date() },
    });
    if (!row.isActive) {
      console.error("[oidc] user inactive:", username);
      return fail("AccessDenied");
    }

    // Auth.js と同形の JWT セッションを発行（credentials と同じ仕組み）。
    const sessionToken = await encode({
      salt: SESSION_COOKIE,
      secret: process.env.AUTH_SECRET ?? "",
      maxAge: SESSION_MAX_AGE,
      token: {
        sub: row.id,
        uid: row.id,
        username: row.username,
        name: row.displayName,
        email: row.email ?? undefined,
      },
    });

    const res = NextResponse.redirect(`${base}/`);
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    // 一時 cookie を破棄。
    for (const c of ["oidc_state", "oidc_nonce", "oidc_verifier"]) {
      res.cookies.set(c, "", { path: "/api/oidc", maxAge: 0 });
    }
    return res;
  } catch (e) {
    console.error("[oidc] callback error:", e);
    return fail("OAuthCallbackError");
  }
}
