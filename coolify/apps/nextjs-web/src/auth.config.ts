/**
 * auth.config.ts — Auth.js v5 の Proxy 用共通設定。
 * Prisma を触る Credentials の authorize は auth.ts 側にのみ置く。
 */

import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true, // socat/cloudflared 経由のため Host を信頼する
  pages: { signIn: "/login" },
  // 純 JWT。既定の 30 日は長すぎる（利用停止・ロール変更が 30 日間セッションに
  // 届かない）ので 12 時間で切り、1 時間ごとに延長する。utilities: auth.ts の
  // jwt コールバックが users.is_active を定期的に見直す。
  session: { strategy: "jwt", maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  providers: [], // providers は auth.ts で合成
  callbacks: {
    // Proxy（authorized）: 未ログインはログインページへ。
    // **user の存在ではなく、セッションに入れた id が文字列であること**を見る
    // （監査 C1）。Auth.js beta.31 以前は設定エラー時に auth オブジェクトが
    // 「error 入り」で埋まり、存在チェックだけの門が開きっぱなしになった。
    // id は callbacks.session で token.uid から入れるので、正常なセッション
    // にしか無い。
    authorized({ auth, request }) {
      const id = (auth?.user as { id?: unknown } | undefined)?.id;
      if (typeof id === "string" && id.length > 0) return true;
      // API は /login へ 307 しない。fetch / EventSource は転送先の HTML を
      // 200 として受け取り、JSON parse 失敗や SSE の再接続ループになるだけで
      // 「ログインし直す」きっかけを得られない。401 で返せば呼び出し側が判る。
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      return false;
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
