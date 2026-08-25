/**
 * Auth.js v5 route handler（/api/auth/*）。
 *
 * ハンドラを AsyncLocalStorage で包んで「今のリクエスト」（IP / UA / 端末
 * シグネチャ）を auth.ts のコールバックへ届ける。Auth.js は authorize() の
 * 第 2 引数にしか Request を渡さず、**SSO はその authorize() を通らない**ので、
 * この包みが無いと SSO の成否を端末情報付きで記録できない。
 * 詳細は lib/auth-request-context.ts のコメント。
 */

import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { runWithAuthRequest } from "@/lib/auth-request-context";
import { resolveDeviceContext } from "@/lib/device-signals";

function withContext<T>(req: NextRequest, run: () => Promise<T>): Promise<T> {
  return runWithAuthRequest(
    { device: resolveDeviceContext(req), receivedAt: Date.now() },
    run,
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  return withContext(req, () => handlers.GET(req));
}

export async function POST(req: NextRequest): Promise<Response> {
  return withContext(req, () => handlers.POST(req));
}
