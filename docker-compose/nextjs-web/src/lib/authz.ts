/**
 * authz.ts — RBAC 強制（web アダプタ）。server-only.
 *
 * 判定ロジックは @ckk/authz-core（両アプリ共通・純粋・単体テスト済み）。
 * このファイルは Auth.js セッション解決 + React cache() によるリクエスト
 * 単位メモ化 + 既存 API（AuthzResult）互換の薄いアダプタ。
 *
 * 使い方 — 全 mutating Server Action / Route Handler の先頭で:
 *   const authz = await checkPermission("quote", "CREATE");
 *   if (!authz.ok) return actionError(authz.error);
 *
 * 規約:
 * - ACTION は要求アクション or ADMIN のどちらかを持てば許可。
 * - permission_code "system" の ADMIN はスーパーユーザー（全コード許可）。
 * - スコープ: checkPermission は access（ALL / 拠点集合+OWN）も返す。
 *   行レベル絞り込みは各機能が access-where ヘルパで適用する（未適用の
 *   機能は従来通り ok だけ見ればよい）。
 */

import {
  type Access,
  type AppPermissionRef,
  buildPermissionSet,
  decide,
  loadPermissionRows,
  loadScopeContext,
  type PermissionAction,
  type PermissionSet,
  readableCodes,
  type ScopeContext,
  visibleAppKeys,
} from "@ckk/authz-core";
import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "./db";

export type { Access, PermissionAction, ScopeContext };

export type AuthzResult =
  | { ok: true; userId: string; access: Access }
  | { ok: false; error: string };

/** セッションのユーザー id（未ログインは null）。 */
export async function sessionUserId(): Promise<string | null> {
  try {
    const session = await auth();
    return (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    return null; // リクエスト外（ビルド・ポーラー）
  }
}

/** ユーザーの権限集合（リクエスト単位でメモ化 — 1 クエリ）。 */
const permissionSetFor = cache(
  async (userId: string): Promise<PermissionSet> =>
    buildPermissionSet(await loadPermissionRows(prisma, userId)),
);

/** スコープ解決コンテキスト（リクエスト単位でメモ化 — 2 クエリ）。 */
const scopeContextFor = cache(
  async (userId: string): Promise<ScopeContext> =>
    loadScopeContext(prisma, userId),
);

/** セッションユーザーの権限集合（未ログインは null）。 */
export async function getPermissionSet(): Promise<PermissionSet | null> {
  const userId = await sessionUserId();
  if (!userId) return null;
  return permissionSetFor(userId);
}

/** セッションユーザーのスコープ解決コンテキスト（未ログインは null）。 */
export async function getScopeContext(): Promise<ScopeContext | null> {
  const userId = await sessionUserId();
  if (!userId) return null;
  return scopeContextFor(userId);
}

/**
 * permission_code × action の権限チェック。
 * 成功時は実効アクセス（access）も返す — スコープ未対応の呼び出し側は
 * これまで通り ok / userId / error だけ見れば挙動不変。
 */
export async function checkPermission(
  code: string,
  action: PermissionAction,
): Promise<AuthzResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "ログインが必要です" };

  const [set, ctx] = await Promise.all([
    permissionSetFor(userId),
    scopeContextFor(userId),
  ]);
  const decision = decide(set, ctx, code, action);
  if (decision.allowed) {
    return { ok: true, userId, access: decision.access };
  }
  return {
    ok: false,
    error: `この操作の権限がありません（${code}:${action}）`,
  };
}

/** Route Handler 用: 失敗時に 401/403 Response を返す。成功時 null。 */
export async function requirePermissionResponse(
  code: string,
  action: PermissionAction,
): Promise<Response | null> {
  const res = await checkPermission(code, action);
  if (res.ok) return null;
  const status = res.error.startsWith("ログイン") ? 401 : 403;
  return Response.json({ error: res.error }, { status });
}

/**
 * READ 可能な permission code 集合（アプリ可視性フィルタ用）。
 * superuser は番兵 "*" を含む。未ログインは空集合。
 */
export async function getReadableCodes(): Promise<ReadonlySet<string>> {
  const set = await getPermissionSet();
  return set ? readableCodes(set) : new Set<string>();
}

/** アプリ一覧 → 表示してよい key 集合（requiredPermission=null は常時可視）。 */
export async function getVisibleAppKeys<T extends AppPermissionRef>(
  apps: readonly T[],
): Promise<Set<string>> {
  const set = await getPermissionSet();
  if (!set) return new Set<string>();
  return visibleAppKeys(set, apps);
}
