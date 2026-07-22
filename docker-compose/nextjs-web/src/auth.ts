/**
 * auth.ts — Auth.js v5 設定（Authentik OIDC + credentials）。
 *
 * Authentik は公式ドキュメント準拠の標準 provider（next-auth/providers/authentik、
 * https://authjs.dev/getting-started/providers/authentik）。env は AUTH_AUTHENTIK_ID
 * / _SECRET / _ISSUER。ISSUER は Authentik の discovery が返す issuer と完全一致
 * （末尾スラッシュ付き）。サインインは Server Action の signIn("authentik") で開始
 * （app/(auth)/login/actions.ts）— リダイレクトはサーバー主導で、PKCE/state cookie
 * が本来の遷移応答で確実にセットされる。
 *
 * - Credentials: app.users の username + password_hash（scrypt）。デモ用。
 * - 初回 SSO ログイン時に profile から app.users を照合・自動作成する（signIn callback）。
 */

import NextAuth from "next-auth";
import Authentik from "next-auth/providers/authentik";
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
    // 公式ドキュメント準拠の標準 Authentik provider（env: AUTH_AUTHENTIK_*）。
    // issuer は AUTH_AUTHENTIK_ISSUER（末尾スラッシュ付き = discovery issuer と一致）。
    ...(authentikEnabled ? [Authentik] : []),
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
