// user_permissions ビュー / 拠点コンテキストの読み出し（唯一の SQL 置き場）。
//
// 両アプリはそれぞれ自前の Prisma Client を生成するため、ここでは構造的
// インターフェース AuthzDb（$queryRaw を持つもの）だけに依存する。
// アダプタ側で React cache() 等によりリクエスト単位でメモ化すること。

import type {
  PermissionAction,
  PermissionRow,
  PermissionScope,
  PlantRef,
  ScopeContext,
} from "./types";

/** Prisma Client が構造的に満たす最小インターフェース */
export interface AuthzDb {
  $queryRaw<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}

interface RawPermissionRow {
  permission_code: string;
  action: string;
  scope: string;
  scope_values: string[] | null;
}

/** ユーザーの全 grant 行（1 クエリ）。ユーザー無効/ロール失効はビュー側で除外済み */
export async function loadPermissionRows(
  db: AuthzDb,
  userId: string,
): Promise<PermissionRow[]> {
  const rows = await db.$queryRaw<RawPermissionRow[]>`
    SELECT permission_code, action::text AS action, scope::text AS scope,
           scope_values
      FROM app.user_permissions
     WHERE user_id = ${userId}::uuid
  `;
  return rows.map((r) => ({
    code: r.permission_code,
    action: r.action as PermissionAction,
    scope: r.scope as PermissionScope,
    scopeValues: r.scope_values ?? ["*"],
  }));
}

interface RawPlantRow {
  id: number;
  code: string;
  region_code: string | null;
  assigned: boolean;
}

/**
 * スコープ解決コンテキスト（1 クエリ）。
 * assignedPlants = user_plants の所属（有効拠点のみ）。
 * allPlants      = 全有効拠点（REGION 展開用 — 件数は高々数十）。
 *
 * 以前は 2 クエリ（所属 / 全拠点）だったが、所属は全拠点の部分集合なので
 * 全拠点を 1 回引いて所属フラグを列に持たせれば足りる。checkPermission は
 * ほぼ全ページ・全 Server Action の先頭で呼ばれるので、往復 1 回ぶんが
 * リクエストごとに効く。
 */
export async function loadScopeContext(
  db: AuthzDb,
  userId: string,
): Promise<ScopeContext> {
  const rows = await db.$queryRaw<RawPlantRow[]>`
    SELECT p.id, p.code, r.code AS region_code,
           EXISTS (
             SELECT 1 FROM app.user_plants up
              WHERE up.user_id = ${userId}::uuid AND up.plant_id = p.id
           ) AS assigned
      FROM app.plants p
      LEFT JOIN app.regions r ON r.id = p.region_id AND r.is_active
     WHERE p.is_active
  `;
  const toRef = (r: RawPlantRow): PlantRef => ({
    id: r.id,
    code: r.code,
    regionCode: r.region_code,
  });
  return {
    userId,
    assignedPlants: rows.filter((r) => r.assigned).map(toRef),
    allPlants: rows.map(toRef),
  };
}

/**
 * 指定権限を持つユーザー id 一覧（通知系 — 例: system:ADMIN 保持者への
 * バグ報告通知）。判定規則は decide と同じ（action or ADMIN or superuser）。
 */
export async function findUserIdsWithPermission(
  db: AuthzDb,
  code: string,
  action: PermissionAction,
): Promise<string[]> {
  const rows = await db.$queryRaw<{ user_id: string }[]>`
    SELECT DISTINCT user_id::text AS user_id
      FROM app.user_permissions
     WHERE (permission_code = ${code} AND action::text IN (${action}, 'ADMIN'))
        OR (permission_code = 'system' AND action::text = 'ADMIN')
  `;
  return rows.map((r) => r.user_id);
}
