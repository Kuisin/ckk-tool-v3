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

export async function ssoSignIn() {
  await signIn("authentik", { redirectTo: "/" });
}
