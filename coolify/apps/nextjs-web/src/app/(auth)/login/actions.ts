"use server";

/**
 * login/actions.ts — SSO サインイン開始（Auth.js v5 の Server Action パターン）。
 *
 * signIn("authentik") をサーバー側で実行し、Authentik authorize へリダイレクトする。
 * リダイレクト応答上で PKCE/state cookie が確実にセットされるため、クライアント
 * fetch + window.location より確実（コールバック検証が安定する）。
 * https://authjs.dev/getting-started/providers/authentik
 */

import { signIn } from "@/auth";
import { safeCallbackPath } from "@/lib/safe-redirect";

export async function ssoSignIn(formData: FormData) {
  // 戻り先はフォームの hidden から受け取る。**ここでも畳み直す** — Server
  // Action は誰でも直接叩けるので、画面が正しい値を入れていることに頼らない。
  const next = safeCallbackPath(formData.get("callbackUrl")?.toString());
  await signIn("authentik", { redirectTo: next });
}
