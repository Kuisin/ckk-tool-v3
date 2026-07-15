/**
 * auth.config.ts — Auth.js v5 の edge 安全な共通設定（middleware 用）。
 * Prisma を触る Credentials の authorize は auth.ts 側にのみ置く。
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true, // socat/cloudflared 経由のため Host を信頼する
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [], // providers は auth.ts で合成
  callbacks: {
    // middleware（authorized）: 未ログインはログインページへ
    authorized({ auth }) {
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id?: string }).id;
        token.username = (user as { username?: string }).username;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.uid as string;
        (session.user as { username?: string }).username =
          token.username as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
