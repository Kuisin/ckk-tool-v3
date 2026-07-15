/**
 * auth.ts — Auth.js v5 設定（credentials + 任意で Authentik SSO）。
 *
 * - Credentials: app.users の username + password_hash（scrypt）。デモ 5 ユーザー
 *   （shared-db/sql/demo-users-seed.sql）用。SSO ユーザーは password_hash null。
 * - Authentik: AUTH_AUTHENTIK_ISSUER / _ID / _SECRET が揃うと有効化。初回ログイン
 *   時に email/username で app.users を照合し、無ければ EMPLOYEE として作成。
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user?.isActive || !user.passwordHash) return null;
        if (!verifyPassword(password, user.passwordHash)) return null;
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
    ...(authentikEnabled ? [Authentik] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // SSO 初回ログイン: app.users を照合・自動作成して内部 id を差し替える
    async signIn({ user, account, profile }) {
      if (account?.provider !== "authentik") return true;
      const username =
        (profile as { preferred_username?: string } | null)
          ?.preferred_username ??
        user.email ??
        user.name;
      if (!username) return false;
      const row = await prisma.user.upsert({
        where: { username },
        create: {
          group: "EMPLOYEE",
          username,
          displayName: user.name ?? username,
          email: user.email,
          isActive: true,
        },
        update: { lastLoginAt: new Date() },
      });
      if (!row.isActive) return false;
      user.id = row.id;
      (user as { username?: string }).username = row.username;
      return true;
    },
  },
});

export const isSsoEnabled = authentikEnabled;
