/**
 * auth.config.ts — Auth.js v5 の Proxy 用共通設定。
 * Prisma を触る Credentials の authorize は auth.ts 側にのみ置く。
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true, // socat/cloudflared 経由のため Host を信頼する
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [], // providers は auth.ts で合成
  callbacks: {
    // Proxy（authorized）: 未ログインはログインページへ。
    // **user の存在ではなく、セッションに入れた id が文字列であること**を見る
    // （監査 C1）。Auth.js beta.31 以前は設定エラー時に auth オブジェクトが
    // 「error 入り」で埋まり、存在チェックだけの門が開きっぱなしになった。
    // id は callbacks.session で token.uid から入れるので、正常なセッション
    // にしか無い。
    authorized({ auth }) {
      const id = (auth?.user as { id?: unknown } | undefined)?.id;
      return typeof id === "string" && id.length > 0;
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
