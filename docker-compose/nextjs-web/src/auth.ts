/**
 * auth.ts — Auth.js v5 設定（Authentik OIDC + credentials）。
 *
 * Authentik は http（非 https）IdP のため、標準 OIDC provider では id_token 署名検証の
 * JWKS 取得が http 拒否されコールバックが失敗する。そこで **OAuth2** provider として
 * 定義し（type:"oauth"・nonce なし）id_token/JWKS 検証を回避、userinfo からプロフィール
 * を取得する（下記 authentikProvider のコメント参照）。env は AUTH_AUTHENTIK_ID/_SECRET/
 * _ISSUER。サインインは Server Action signIn("authentik")（app/(auth)/login/actions.ts）。
 *
 * - Credentials: app.users の username + password_hash（scrypt）。デモ用。
 * - 初回 SSO ログイン時に profile から app.users を照合・自動作成する（signIn callback）。
 */

import NextAuth from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "./lib/db";
import { verifyPassword } from "./lib/password";

const authentikEnabled =
  !!process.env.AUTH_AUTHENTIK_ISSUER &&
  !!process.env.AUTH_AUTHENTIK_ID &&
  !!process.env.AUTH_AUTHENTIK_SECRET;

interface AuthentikProfile {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
}

// Authentik を **OAuth2**（OIDC ではなく）provider として定義する。
// 理由: IdP が http（https ではない）で、@auth/core は id_token 署名検証時の JWKS 取得
// にだけ allowInsecureRequests を渡さないため、http の jwks_uri が拒否されコールバック
// が OAuthCallbackError で失敗する（ログイン画面へ無言でループ）。
// type:"oauth" + nonce なし にすると processAuthorizationCodeResponse が OAuth2 経路を
// 通り id_token/JWKS 検証をスキップし、userinfo（http 許可あり）からプロフィールを取得
// する。discovery/token/userinfo は @auth/core が allowInsecureRequests を渡すため http
// でも成立。issuer は discovery に使用（末尾スラッシュ付き = discovery issuer と一致）。
// Authentik OAuth2 エンドポイント（Authentik は常に {origin}/application/o/... 配下）。
// issuer にはアプリスラッグが含まれるため origin から明示的に組み立てる。OAuth2 経路の
// userinfo は provider.userinfo.url を参照する（discovery 由来ではない）ため明示必須
// — 未指定だと "No userinfo endpoint configured" になる。token/userinfo とも http 許可。
const authentikOAuthBase = process.env.AUTH_AUTHENTIK_ISSUER
  ? `${new URL(process.env.AUTH_AUTHENTIK_ISSUER).origin}/application/o`
  : "";

const authentikProvider: OAuthConfig<AuthentikProfile> = {
  id: "authentik",
  name: "Authentik",
  type: "oauth",
  issuer: process.env.AUTH_AUTHENTIK_ISSUER,
  clientId: process.env.AUTH_AUTHENTIK_ID,
  clientSecret: process.env.AUTH_AUTHENTIK_SECRET,
  authorization: {
    url: `${authentikOAuthBase}/authorize/`,
    params: { scope: "openid profile email" },
  },
  token: `${authentikOAuthBase}/token/`,
  userinfo: `${authentikOAuthBase}/userinfo/`,
  // pkce のみ（Authentik 標準 provider と同じ）。state を含めると @auth/core が
  // 「state value could not be parsed」で失敗する（beta 既知の相性問題）。PKCE で
  // 認可コードとクライアントが束縛されるため CSRF 保護は担保される。
  checks: ["pkce"],
  profile(profile) {
    return {
      id: profile.sub,
      name: profile.name ?? profile.preferred_username ?? profile.sub,
      email: profile.email ?? null,
      username: profile.preferred_username ?? profile.email ?? profile.sub,
    };
  },
};

// 簡易ログインレート制限（監査 P2-9）: ユーザー名毎に 15 分で失敗 5 回まで。
// インメモリ（プロセス毎）— 単一コンテナ運用では十分。成功でリセット。
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60_000;

function loginRateLimited(username: string): boolean {
  const rec = loginFailures.get(username);
  if (!rec || Date.now() > rec.resetAt) return false;
  return rec.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(username: string): void {
  const rec = loginFailures.get(username);
  if (!rec || Date.now() > rec.resetAt) {
    loginFailures.set(username, {
      count: 1,
      resetAt: Date.now() + LOGIN_WINDOW_MS,
    });
  } else {
    rec.count += 1;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // AUTH_DEBUG=true で OAuth フロー（cookie/state/token/profile）を詳細ログ出力。
  debug: process.env.AUTH_DEBUG === "true",
  providers: [
    Credentials({
      name: "ユーザー名 / パスワード",
      credentials: {
        username: { label: "ユーザー名" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        const username =
          typeof credentials?.username === "string"
            ? credentials.username.trim()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!username || !password) return null;
        if (loginRateLimited(username)) {
          console.warn(`[auth] レート制限: ${username}`);
          return null;
        }
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user?.isActive || !user.passwordHash) {
          recordLoginFailure(username);
          return null;
        }
        if (!verifyPassword(password, user.passwordHash)) {
          recordLoginFailure(username);
          return null;
        }
        loginFailures.delete(username);
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        return {
          id: user.id,
          name: user.displayName,
          email: user.email ?? undefined,
          username: user.username,
        };
      },
    }),
    // Authentik（http IdP のため OAuth2 として定義。上記 authentikProvider 参照）。
    ...(authentikEnabled ? [authentikProvider] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // 初回 SSO ログイン: profile から app.users を照合・自動作成し、内部 id を差し替える。
    async signIn({ user, account, profile }) {
      if (account?.provider !== "authentik") return true;
      const p = profile as {
        preferred_username?: string;
        email?: string;
        name?: string;
      } | null;
      const username =
        p?.preferred_username ?? user.email ?? p?.email ?? user.name;
      if (!username) {
        console.error(
          "[auth][sso] no username claim; profile keys=",
          Object.keys((profile as object) ?? {}),
        );
        return false;
      }
      try {
        const row = await prisma.user.upsert({
          where: { username },
          create: {
            group: "EMPLOYEE",
            username,
            displayName: user.name ?? p?.name ?? username,
            email: user.email ?? p?.email ?? null,
            isActive: true,
          },
          update: { lastLoginAt: new Date() },
        });
        if (!row.isActive) return false;
        user.id = row.id;
        (user as { username?: string }).username = row.username;
        return true;
      } catch (e) {
        console.error("[auth][sso] user upsert failed:", e);
        return false;
      }
    },
  },
});

export const isSsoEnabled = authentikEnabled;
