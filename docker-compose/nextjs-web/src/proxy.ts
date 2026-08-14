/**
 * proxy.ts — 認証ガード。未ログインはログインページへ（Auth.js v5）。
 * /login・/api/auth・公開マニュアル（/manual + 生 Markdown の /llms-manual）
 * のみ公開。静的アセット・PWA アイコン等は matcher で除外。
 * /internal-docs は除外しない（要ログイン — レイアウト側でも二重確認）。
 */

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  matcher: [
    "/((?!api/auth|api/sso|api/preview|login|manual(?:$|/)|llms-manual(?:$|/)|_next/static|_next/image|favicon\\.ico|design-assets|manifest\\.webmanifest|icons|sw\\.js).*)",
  ],
};
