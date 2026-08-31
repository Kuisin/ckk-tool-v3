/**
 * proxy.ts — 認証ガード。未ログインはログインページへ（Auth.js v5）。
 * /login・/api/auth・公開マニュアル（/manual + 生 Markdown の /llms-manual）
 * のみ公開。静的アセット・PWA アイコン等は matcher で除外。
 *
 * `/api/health` も除外必須 — Coolify の healthcheck は未ログインで叩くため。
 * 返すのはマイグレーションの適用状況だけで、業務データは含めない。
 * `/api/device-signals` も除外必須 — ログイン画面（＝未ログイン）から叩く
 * 端末シグネチャの受け口なので、ここを守ると 307 されて機能が無言で死ぬ。
 * `/api/intake/inbound` も除外必須 — 共有シークレット（X-Intake-Token）で
 * 認証する機械向けの注文書投入口。**`api/intake` と書いてはいけない** —
 * それだと即座に採番する `/api/intake/upload` と `/api/intake/folder` から
 * セッション認証まで外れる。
 * `/portal` も除外必須 — 取引先ポータル（社外向け）は Auth.js のセッションを
 * 持たない別の認証系（lib/portal-auth.ts の portal_session Cookie）なので、
 * ここを守ると社外の人が必ず /login へ 307 される。**`portal` と素で書かず
 * `portal(?:$|/)` とアンカーすること** — 素だと将来の `/portalXxx` まで
 * 未認証になる（`api/intake` を広く書いて `/api/intake/upload` の認証まで
 * 外した前例と同じ罠）。
 * なお matcher は `config` の静的な定数なので**環境で分岐できない**。
 * 除外は dev / main を問わず入り、main では機能フラグ
 * （src/config/dev-features.json）を見るページ・ルートハンドラ側が 404 を返して
 * 閉じる。matcher が言っているのは「認証を要求しない」だけで「中身がある」
 * ではない。
 * /admin-manual は除外しない（要ログイン — レイアウト側でも二重確認）。
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
    "/((?!api/auth|api/sso|api/preview|api/device-signals|api/health|api/intake/inbound|login|portal(?:$|/)|manual(?:$|/)|llms-manual(?:$|/)|_next/static|_next/image|favicon\\.ico|icon\\.svg|design-assets|manifest\\.webmanifest|icons|sw\\.js).*)",
  ],
};
