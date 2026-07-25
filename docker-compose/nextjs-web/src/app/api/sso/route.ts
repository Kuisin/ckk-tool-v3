import { signIn } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/sso — Authentik から開いたときの自動ログイン起点（IdP-initiated SSO）。
 *
 * Authentik アプリの **Launch URL** にこの URL を設定する。アクセスすると即座に
 * signIn("authentik") で Authentik の authorize へリダイレクトし、既に Authentik
 * セッションがあれば（ライブラリから開いた直後は必ずある）無言でコールバックまで
 * 通ってダッシュボードに着地する = 自動ログイン。
 *
 * ログインページを経由しないため「ボタンを押す」操作が不要。認証ガード(proxy.ts)の
 * matcher からは除外している。
 */
export async function GET(request: Request): Promise<Response> {
  // オープンリダイレクト防止: 相対パスのみ許可（//... は拒否）。
  const raw = new URL(request.url).searchParams.get("callbackUrl") ?? "/";
  const callbackUrl = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  await signIn("authentik", { redirectTo: callbackUrl });
  // signIn は redirect を throw するため到達しない（型のための fallback）。
  return Response.redirect(new URL(callbackUrl, request.url));
}
