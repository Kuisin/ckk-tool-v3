/**
 * auth.ts — Auth.js v5 設定（credentials セッション基盤）。
 *
 * - Credentials: app.users の username + password_hash（scrypt）。デモ 5 ユーザー
 *   （shared-db/sql/demo-users-seed.sql）用。SSO ユーザーは password_hash null。
 * - Authentik SSO は自前の OIDC ハンドラ（app/api/oidc/*、lib/oidc.ts）で実装し、
 *   Auth.js と同形の JWT セッション cookie を発行する（Auth.js の OAuth provider は
 *   使わない）。AUTH_AUTHENTIK_ISSUER/_ID/_SECRET が揃うとログイン画面で有効化。
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "./lib/db";
import { verifyPassword } from "./lib/password";

const authentikEnabled =
  !!process.env.AUTH_AUTHENTIK_ISSUER &&
  !!process.env.AUTH_AUTHENTIK_ID &&
  !!process.env.AUTH_AUTHENTIK_SECRET;

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
  ],
  // Authentik SSO は app/api/oidc/* が担当（Auth.js の OAuth provider は不使用）。
  // credentials のセッション/JWT 基盤（authConfig.callbacks）はそのまま利用する。
});

export const isSsoEnabled = authentikEnabled;
