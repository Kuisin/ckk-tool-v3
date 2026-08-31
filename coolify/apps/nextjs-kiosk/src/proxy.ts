/**
 * proxy.ts — キオスクのルーティングガード（Cookie の存在チェックのみ）。
 *
 * 本検証（DB 照合・期限・アイドル）は各サーバーコンポーネント / ルート側の
 * kiosk-auth.ts が毎回行う — ここは「明らかに未登録/未ログインの端末を正しい
 * 画面へ送る」だけ（nextjs-web の proxy と同じ役割分担）。
 *
 *   kiosk_device Cookie なし → /setup（端末登録）
 *   kiosk_session Cookie なし → /login（QR スキャン）
 *
 * /display（管理ディスプレイ）は**どちらの Cookie も持たない別系統**なので
 * DEVICE_FREE に入れる。ここを外すと、新品の Raspberry Pi が延々とキオスクの
 * 端末登録画面を映し続け、ペアリング画面に永久に到達しない。
 */

import { type NextRequest, NextResponse } from "next/server";

const DEVICE_COOKIE = "kiosk_device";
const SESSION_COOKIE = "kiosk_session";

// 端末信頼なしでも入れる画面（/device-settings は Cookie が壊れた端末の
// 復旧経路でもあるため、ログイン前・端末信頼なしでも到達できる）
const DEVICE_FREE = new Set([
  "/setup",
  "/device-error",
  "/device-settings",
  "/display",
]);

// 管理ディスプレイの配下（/display/content/... など）。前方一致で通す。
const DEVICE_FREE_PREFIXES = ["/display/"];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasDevice = req.cookies.has(DEVICE_COOKIE);
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (
    DEVICE_FREE.has(pathname) ||
    DEVICE_FREE_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  if (!hasDevice) {
    return NextResponse.redirect(new URL("/setup", req.url));
  }
  if (!hasSession && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // API は各ルートが自前で検証（ここで弾くと setup ポーリング等が死ぬ）。
    // apk/ は Android ラッパー APK の公開配布パス（未登録端末が Cookie なしで
    // ダウンロードする — リダイレクトすると provisioning が失敗する）
    "/((?!api|apk/|_next/static|_next/image|favicon\\.ico|icon\\.svg).*)",
  ],
};
