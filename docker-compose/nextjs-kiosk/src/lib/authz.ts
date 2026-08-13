/**
 * authz.ts — 権限判定。
 *
 * nextjs-web 同様 `app.user_permissions` ビュー（有効ロールのみ・最上位
 * スコープ）を参照する。用途は 2 つ:
 *
 * - `readableCodes()` … ランチャーの**表示**フィルタ（どのアプリを出すか）
 * - `hasPermission()` … **書き込み**の門番（nextjs-web の checkPermission 相当）
 *
 * 表示フィルタと書き込みゲートは意図的に別物にしてある。加えて工程実行では
 * 行レベルの割り当てゲート（step-execution.ts の `isAssignedToUser`）も
 * 通す — permission だけでは「他人の工程を操作できない」を担保できないため。
 */

import { prisma } from "./db";

export type PermissionAction =
  | "READ"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "EXPORT"
  | "APPROVE"
  | "ADMIN";

/** ユーザーが READ（または ADMIN）を持つ permission_code の集合。 */
export async function readableCodes(userId: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ permission_code: string }[]>`
    SELECT DISTINCT permission_code FROM app.user_permissions
    WHERE user_id = ${userId}::uuid
      AND action::text IN ('READ', 'ADMIN')`;
  const codes = new Set(rows.map((r) => r.permission_code));
  // "system" の ADMIN はスーパーユーザー（nextjs-web authz.ts と同じ規約）
  const admin = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM app.user_permissions
    WHERE user_id = ${userId}::uuid
      AND permission_code = 'system' AND action::text = 'ADMIN'
    LIMIT 1`;
  if (admin.length > 0) codes.add("*");
  return codes;
}

/**
 * permission_code × action の権限チェック（書き込み用）。
 * nextjs-web の checkPermission と同じ規約:
 * - 要求 action か ADMIN のどちらかを持てば許可
 * - permission_code "system" の ADMIN はスーパーユーザー
 *
 * nextjs-web と違い AUTHZ_DISABLED の脱出ハッチは持たない — 共有端末は
 * 権限を素通しして良い場所ではない。
 */
export async function hasPermission(
  userId: string,
  code: string,
  action: PermissionAction,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM app.user_permissions
    WHERE user_id = ${userId}::uuid
      AND (
        (permission_code = ${code} AND action::text IN (${action}, 'ADMIN'))
        OR (permission_code = 'system' AND action::text = 'ADMIN')
      )
    LIMIT 1`;
  return rows.length > 0;
}
