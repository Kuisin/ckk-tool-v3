/**
 * proxy.ts — 認証ガード。未ログインはログインページへ（Auth.js v5）。
 * /login と /api/auth のみ公開。静的アセット・PWA アイコン等は matcher で除外。
 */

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  matcher: [
    "/((?!api/auth|api/oidc|api/preview|login|_next/static|_next/image|favicon\\.ico|design-assets|manifest\\.webmanifest|icons|sw\\.js).*)",
  ],
};
