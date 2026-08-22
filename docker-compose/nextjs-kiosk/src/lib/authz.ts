/**
 * authz.ts — 権限判定（kiosk アダプタ）。
 *
 * 判定ロジックは @ckk/authz-core（nextjs-web と共通・純粋・単体テスト済み）。
 * このファイルは kiosk セッションの userId を引数で受ける薄いアダプタで、
 * 既存 API（readableCodes / hasPermission）の互換を維持する。用途は 2 つ:
 *
 * - `readableCodes()` … ランチャーの**表示**フィルタ（どのアプリを出すか）
 * - `hasPermission()` … **書き込み**の門番（nextjs-web の checkPermission 相当）
 *
 * 表示フィルタと書き込みゲートは意図的に別物にしてある。加えて工程実行では
 * 行レベルの割り当てゲート（step-execution.ts の `canOperateStep`）も
 * 通す — permission だけでは「他人の工程を操作できない」を担保できないため。
 * スコープ値に関わらず割り当てゲートを維持する（permissionAccess は将来の
 * 切替ポイントとしてのプラミング）。
 *
 * nextjs-web と違い認可の脱出ハッチは持たない — 共有端末は権限を素通しして
 * 良い場所ではない。
 */

import {
  type Access,
  buildPermissionSet,
  readableCodes as coreReadableCodes,
  decide,
  loadPermissionRows,
  loadScopeContext,
  type PermissionAction,
} from "@ckk/authz-core";
import { cache } from "react";
import { prisma } from "./db";

export type { Access, PermissionAction };

/** ユーザーの権限集合（リクエスト単位でメモ化 — 1 クエリ）。 */
const permissionSetFor = cache(async (userId: string) =>
  buildPermissionSet(await loadPermissionRows(prisma, userId)),
);

/** スコープ解決コンテキスト（リクエスト単位でメモ化 — 2 クエリ）。 */
const scopeContextFor = cache(async (userId: string) =>
  loadScopeContext(prisma, userId),
);

/**
 * ユーザーが READ（または ADMIN）を持つ permission_code の集合。
 * "system" の ADMIN（スーパーユーザー）は番兵 "*" を含む（従来互換）。
 */
export async function readableCodes(userId: string): Promise<Set<string>> {
  const set = await permissionSetFor(userId);
  return new Set(coreReadableCodes(set));
}

/**
 * permission_code × action の権限チェック（書き込み用）。
 * 規約は authz-core decide(): 要求 action か ADMIN / system:ADMIN 許可。
 */
export async function hasPermission(
  userId: string,
  code: string,
  action: PermissionAction,
): Promise<boolean> {
  const [set, ctx] = await Promise.all([
    permissionSetFor(userId),
    scopeContextFor(userId),
  ]);
  return decide(set, ctx, code, action).allowed;
}

/**
 * 実効アクセス（ALL / 拠点集合+OWN）。deny 時は null。
 * 工程実行は現状スコープ値に関わらず割り当てゲートで絞るため未消費 —
 * ALL/PLANT スコープのユーザーに未割当工程を見せる将来拡張の切替点。
 */
export async function permissionAccess(
  userId: string,
  code: string,
  action: PermissionAction,
): Promise<Access | null> {
  const [set, ctx] = await Promise.all([
    permissionSetFor(userId),
    scopeContextFor(userId),
  ]);
  const decision = decide(set, ctx, code, action);
  return decision.allowed ? decision.access : null;
}
