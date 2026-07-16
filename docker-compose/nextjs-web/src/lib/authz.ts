/**
 * authz.ts — RBAC 強制（監査 P0-1）。server-only.
 *
 * `user_permissions` ビュー（roles → role_permission_relation を user 毎に
 * 集約、最上位 SCOPE のみ）で permission_code × ACTION を判定する。
 *
 * 使い方 — 全 mutating Server Action / Route Handler の先頭で:
 *   const authz = await checkPermission("quote", "CREATE");
 *   if (!authz.ok) return actionError(authz.error);
 *
 * 規約:
 * - ACTION は要求アクション or ADMIN のどちらかを持てば許可。
 * - permission_code "system" の ADMIN はスーパーユーザー（全コード許可）。
 * - スコープ（FACTORY/OWN 等）は現状 ALL 前提 — 行レベル絞り込みは各機能側
 *   の将来拡張（このヘルパは code×action の門番）。
 * - 環境変数 AUTHZ_DISABLED=1 で一時無効化（ロールアウト時の緊急脱出。
 *   使用時は警告ログ）。
 */

import { auth } from "@/auth";
import { prisma } from "./db";

export type PermissionAction =
  | "READ"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "APPROVE"
  | "ADMIN";

export type AuthzResult =
  | { ok: true; userId: string }
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

/**
 * permission_code × action の権限チェック。
 * 判定は user_permissions ビュー（有効ロールのみ・最上位スコープ）。
 */
export async function checkPermission(
  code: string,
  action: PermissionAction,
): Promise<AuthzResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "ログインが必要です" };

  if (process.env.AUTHZ_DISABLED === "1") {
    console.warn(`[authz] AUTHZ_DISABLED=1 — ${code}:${action} を素通し`);
    return { ok: true, userId };
  }

  const rows = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM app.user_permissions
    WHERE user_id = ${userId}::uuid
      AND (
        (permission_code = ${code} AND action::text IN (${action}, 'ADMIN'))
        OR (permission_code = 'system' AND action::text = 'ADMIN')
      )
    LIMIT 1`;
  if (rows.length > 0) return { ok: true, userId };
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
