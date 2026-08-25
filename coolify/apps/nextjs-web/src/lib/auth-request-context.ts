/**
 * auth-request-context.ts — Auth.js のコールバックから「今のリクエスト」を見る。
 *
 * Auth.js v5 は authorize() の第 2 引数にしか Request を渡さない。credentials は
 * それで足りるが、**SSO（Authentik）は authorize() を一切通らない** ので、
 * SSO の成否を IP / UA / 端末シグネチャ付きで記録できない。
 *
 * 検討した選択肢:
 *   (a) authorize(credentials, request) の第 2 引数 … SSO を落とす
 *   (b) events.signIn                              … 失敗イベントが無い・request も無い
 *   (c) route.ts で handlers を包み AsyncLocalStorage … ← これ
 *   (d) callbacks 内で next/headers の headers()   … auth.ts が next/headers に
 *       依存すると、リクエスト文脈の外から auth() を呼ぶ経路で throw する
 *
 * (c) にすると 1 リクエスト = 1 文脈が authorize / callbacks / events / logger の
 * 全部に届く。同じ形の前例がリポジトリにある（nextjs-kiosk の audit.ts
 * runWithActor）。
 *
 * Server Action 経由の signIn("authentik")（login/actions.ts・/api/sso）は
 * この route.ts を通らないが、**そこでは認証の結果が出ない**（authorize へ
 * リダイレクトするだけ）。結果が出るコールバック
 * /api/auth/callback/authentik は通る。credentials の POST も通る。
 */

import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { DeviceContext } from "@/lib/device-signals";

export interface AuthRequestContext {
  device: DeviceContext;
  receivedAt: number;
}

const storage = new AsyncLocalStorage<AuthRequestContext>();

/** Auth.js のハンドラをこの中で実行する（route.ts が呼ぶ）。 */
export function runWithAuthRequest<T>(
  context: AuthRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}

/** 文脈の外（cron・ビルド時など）から呼ばれたら null。 */
export function currentAuthRequest(): AuthRequestContext | null {
  return storage.getStore() ?? null;
}
