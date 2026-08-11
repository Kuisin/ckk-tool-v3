/**
 * authz.ts — ランチャーの権限フィルタ。
 *
 * nextjs-web 同様 `app.user_permissions` ビュー（有効ロールのみ・最上位
 * スコープ）を参照。キオスクは表示フィルタ用途なので、ユーザーの持つ
 * permission_code 集合をまとめて取る。
 */

import { prisma } from "./db";

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
