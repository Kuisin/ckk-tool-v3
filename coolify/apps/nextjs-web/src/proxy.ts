/**
 * proxy.ts — 認証ガード。未ログインはログインページへ（Auth.js v5）。
 * /login・/api/auth・公開マニュアル（/manual + 生 Markdown の /llms-manual）
 * のみ公開。静的アセット・PWA アイコン等は matcher で除外。
 * /internal-docs は除外しない（要ログイン — レイアウト側でも二重確認）。
 *
 * ファビコン `/icon.svg`（app/icon.svg の Next 規約ルート）も除外必須 —
 * 未ログイン状態で /login へ 307 されると、ブラウザは SVG の代わりに HTML を
 * 受け取ってタブアイコンを表示できない（Chrome は失敗をしばらくキャッシュする）。
 */

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  matcher: [
    "/((?!api/auth|api/sso|api/preview|login|manual(?:$|/)|llms-manual(?:$|/)|_next/static|_next/image|favicon\\.ico|icon\\.svg|design-assets|manifest\\.webmanifest|icons|sw\\.js).*)",
  ],
};
