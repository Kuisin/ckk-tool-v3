/**
 * api-authz.ts — 外部 API（/api/v1）の認可 + ルートハンドラの門。server-only.
 *
 * 判定は @ckk/authz-core（画面・キオスクと同じコア）。このファイルは
 * **キオスク側のアダプタと同じ形** — userId を引数で受ける。
 * lib/authz.ts（Web 用）は `auth()` セッション前提なので使わない。
 *
 * 使い方 — /api/v1 配下の全ハンドラはこのどちらかで始める:
 *
 *   const gate = await requireApiPermission(request, "quote", "READ");
 *   if (!gate.ok) return gate.response;
 *   // gate.ctx（呼び出し元）と gate.access（行スコープ）が使える
 *
 *   const gate = await requireApiAuth(request);   // 認証だけでよい口（/me）
 *   if (!gate.ok) return gate.response;
 *
 * scripts/check-api-gates.mjs がこの 2 つの呼び出しを機械で確認する。
 *
 * ■ 行レベルのスコープは呼び出し側が掛ける
 * `access` をそのまま返すので、一覧は `ownOrPlantWhere(access, userId, …)`、
 * 詳細は `rowInScope(...)` を**画面と同じ関数**で使うこと。ここを別に書くと
 * API と画面で見える範囲がずれる。
 */

import "server-only";

import {
  type Access,
  buildPermissionSet,
  decide,
  loadPermissionRows,
  loadScopeContext,
  type PermissionAction,
  readableCodes,
} from "@ckk/authz-core";
import { cache } from "react";
import {
  type ApiClientContext,
  logApiAccess,
  resolveApiClient,
} from "./api-auth";
import {
  forbidden,
  instanceOf,
  rateLimited,
  unauthorized,
} from "./api-problem";
import { notFound } from "./api-response";
import { prisma } from "./db";

/** 権限集合（リクエスト単位でメモ化 — 1 クエリ）。 */
const permissionSetFor = cache(async (userId: string) =>
  buildPermissionSet(await loadPermissionRows(prisma, userId)),
);

/** スコープ解決コンテキスト（リクエスト単位でメモ化 — 1 クエリ）。 */
const scopeContextFor = cache(async (userId: string) =>
  loadScopeContext(prisma, userId),
);

export type ApiGate =
  | { ok: true; ctx: ApiClientContext; access: Access }
  | { ok: false; response: Response };

export type ApiAuthGate =
  | { ok: true; ctx: ApiClientContext }
  | { ok: false; response: Response };

/**
 * 認証だけの門（/api/v1/me 用）。
 *
 * 機能が閉じている環境では **404**（401 ではない）— 無い機能の存在を
 * 知らせない（portal と同じ姿勢）。
 */
export async function requireApiAuth(request: Request): Promise<ApiAuthGate> {
  const auth = await resolveApiClient(request);
  const path = instanceOf(request);

  if (!auth.ok) {
    if (auth.reason === "FEATURE_OFF") {
      return { ok: false, response: notFound() };
    }
    const response =
      auth.reason === "RATE_LIMITED" ? rateLimited(path) : unauthorized(path);
    await logApiAccess({
      method: request.method,
      path,
      status: response.status,
      denyReason: auth.reason,
    });
    return { ok: false, response };
  }

  await logApiAccess({
    clientId: auth.ctx.clientId,
    tokenId: auth.ctx.tokenId,
    method: request.method,
    path,
    status: 200,
    ip: auth.ctx.ip,
    forwardedFor: auth.ctx.forwardedFor,
    userAgent: auth.ctx.userAgent,
  });
  return { ok: true, ctx: auth.ctx };
}

/** 権限コード × アクションの門。成功時は行スコープ（access）も返す。 */
export async function requireApiPermission(
  request: Request,
  code: string,
  action: PermissionAction,
): Promise<ApiGate> {
  const gate = await requireApiAuth(request);
  if (!gate.ok) return gate;

  const { ctx } = gate;
  const [set, scope] = await Promise.all([
    permissionSetFor(ctx.userId),
    scopeContextFor(ctx.userId),
  ]);
  const decision = decide(set, scope, code, action);

  if (!decision.allowed) {
    const path = instanceOf(request);
    await logApiAccess({
      clientId: ctx.clientId,
      tokenId: ctx.tokenId,
      method: request.method,
      path,
      status: 403,
      permissionCode: `${code}:${action}`,
      ip: ctx.ip,
      forwardedFor: ctx.forwardedFor,
      userAgent: ctx.userAgent,
    });
    return { ok: false, response: forbidden(code, action, path) };
  }

  return { ok: true, ctx, access: decision.access };
}

/** /api/v1/me が返す実効権限（呼び出し側が 403 を自分で診断できるように）。 */
export async function apiEffectivePermissions(userId: string): Promise<{
  codes: string[];
  superuser: boolean;
}> {
  const set = await permissionSetFor(userId);
  const codes = readableCodes(set);
  return {
    superuser: codes.has("*"),
    codes: [...codes].filter((c) => c !== "*").sort(),
  };
}
