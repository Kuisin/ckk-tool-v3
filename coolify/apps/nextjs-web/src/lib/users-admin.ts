import "server-only";

/**
 * users-admin.ts — ユーザー管理（SY01）のデータ取得。server-only・読み取り専用。
 *
 * app.users + ロール割当（user_role_relation）+ 実効権限（user_permissions
 * ビュー — 集約済み・最上位スコープのみ）を提供する。閲覧は RBAC
 * （system:READ）でゲート — 呼び出し側ページで checkPermission を通すこと。
 */

import {
  groupPermissionsByCode,
  type PermissionAction,
  type PermissionScope,
} from "@ckk/authz-core";
import { BOOTSTRAP_ADMIN_USERNAME } from "./bootstrap-admin-core";
import { prisma } from "./db";
import type { LocalizedText } from "./format";

export interface AdminUserRole {
  id: number;
  rolename: string;
  displayName: LocalizedText | null;
}

export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  group: "SYSTEM" | "EMPLOYEE" | "GUEST";
  isActive: boolean;
  /** 一時停止の解除予定（ISO）。null かつ isActive=false は恒久停止。 */
  disabledUntil: string | null;
  disabledReason: string | null;
  /** ISO 文字列（クライアント側で formatDateTime）。 */
  lastLoginAt: string | null;
  roles: AdminUserRole[];
}

export interface AdminUserAssignment extends AdminUserRole {
  isActive: boolean;
  assignedAt: string | null;
  deactivateAt: string | null;
}

/** 1 アクションぶんの到達範囲。 */
export interface AdminUserPermissionAction {
  action: string;
  scope: string;
  /** grant のスコープ対象コード（'*' = ワイルドカード）。ALL/OWN では無意味 */
  scopeValues: string[];
}

/** 実効権限の 1 行 = 1 権限コード（アクションは中に並べる）。 */
export interface AdminUserPermission {
  permissionCode: string;
  actions: AdminUserPermissionAction[];
  /** 全アクションで範囲が同じならその 1 つ。違えばアクションごとに出す。 */
  uniformScope: { scope: string; scopeValues: string[] } | null;
}

/** 所属拠点（user_plants — PLANT/REGION スコープ解決の基盤）。 */
export interface AdminUserPlant {
  id: number;
  code: string;
  name: LocalizedText | null;
  isActive: boolean;
}

export interface AdminUserDetail extends AdminUserRow {
  employeeId: string | null;
  /** credentials ログイン可否（false = SSO のみ）。ハッシュ自体は返さない。 */
  hasPassword: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  assignments: AdminUserAssignment[];
  permissions: AdminUserPermission[];
  plants: AdminUserPlant[];
}

/** ロール一覧（ロール割当セレクタの選択肢）。 */
export async function listRoleOptions(): Promise<AdminUserRole[]> {
  const rows = await prisma.role.findMany({
    orderBy: { rolename: "asc" },
    select: { id: true, rolename: true, displayName: true },
  });
  return rows.map((r) => ({
    id: r.id,
    rolename: r.rolename,
    displayName: r.displayName as LocalizedText | null,
  }));
}

/**
 * system:ADMIN を与えるロールの id。
 *
 * ロール名（`admin`）で数えないのは getAdminCoverage と同じ理由 — ロール構成は
 * 運用で変わるが、「実際に管理できるか」は grant があるかどうかで決まる。
 * ここは grant（role_permission_relation）を直接見るので、users.is_active は
 * 効かない（ロールの性質であってユーザーの状態ではないため）。
 */
export async function listAdminRoleIds(): Promise<number[]> {
  const rows = await prisma.rolePermissionRelation.findMany({
    where: { permissionCode: "system", action: "ADMIN" },
    select: { roleId: true },
  });
  return [...new Set(rows.map((r) => r.roleId))];
}

/** 有効な拠点一覧（所属拠点セレクタの選択肢）。 */
export async function listActivePlantOptions(): Promise<AdminUserPlant[]> {
  const rows = await prisma.plant.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, isActive: true },
  });
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name as LocalizedText | null,
    isActive: p.isActive,
  }));
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { username: "asc" }],
    include: {
      roleAssignments: {
        where: { isActive: true },
        include: { role: true },
      },
    },
  });
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    group: u.group,
    isActive: u.isActive,
    disabledUntil: u.disabledUntil?.toISOString() ?? null,
    disabledReason: u.disabledReason ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    roles: u.roleAssignments.map((a) => ({
      id: a.role.id,
      rolename: a.role.rolename,
      displayName: a.role.displayName as LocalizedText | null,
    })),
  }));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAdminUser(
  id: string,
): Promise<AdminUserDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      roleAssignments: {
        include: { role: true },
        orderBy: { assignedAt: "desc" },
      },
      userPlants: {
        include: { plant: true },
        orderBy: { plant: { code: "asc" } },
      },
    },
  });
  if (!u) return null;
  // ビューは grant 単位の全行を返す（1 code×action に複数ロール分の行があり得る）。
  // 画面には **いちばん広い 1 行だけ** を出すので、読み込んだあと畳む（下）。
  const permissions = await prisma.$queryRaw<
    {
      permission_code: string;
      action: string;
      scope: string;
      scope_values: string[] | null;
    }[]
  >`
    SELECT permission_code, action::text AS action, scope::text AS scope, scope_values
    FROM app.user_permissions
    WHERE user_id = ${id}::uuid
    ORDER BY permission_code, action, scope`;
  const activeAssignments = u.roleAssignments.filter((a) => a.isActive);
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    group: u.group,
    isActive: u.isActive,
    disabledUntil: u.disabledUntil?.toISOString() ?? null,
    disabledReason: u.disabledReason ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    roles: activeAssignments.map((a) => ({
      id: a.role.id,
      rolename: a.role.rolename,
      displayName: a.role.displayName as LocalizedText | null,
    })),
    employeeId: u.employeeId,
    hasPassword: !!u.passwordHash,
    createdAt: u.createdAt?.toISOString() ?? null,
    updatedAt: u.updatedAt?.toISOString() ?? null,
    assignments: u.roleAssignments.map((a) => ({
      id: a.role.id,
      rolename: a.role.rolename,
      displayName: a.role.displayName as LocalizedText | null,
      isActive: a.isActive,
      assignedAt: a.assignedAt?.toISOString() ?? null,
      deactivateAt: a.deactivateAt?.toISOString() ?? null,
    })),
    // 1 行 = 1 権限コード。同じコードが複数ロール・複数アクションで何行も
    // 並ぶと「この権限で何ができるのか」が読めない（携帯では特に）。
    // 判定（decide）は従来どおり全行の和集合で行い、**表示だけ** を畳む。
    // まとめ方の定義は @ckk/authz-core が 1 本持つ。
    permissions: groupPermissionsByCode(
      permissions.map((p) => ({
        code: p.permission_code,
        action: p.action as PermissionAction,
        scope: p.scope as PermissionScope,
        scopeValues: p.scope_values ?? ["*"],
      })),
    ).map((g) => ({
      permissionCode: g.code,
      actions: g.actions.map((a) => ({
        action: a.action as string,
        scope: a.scope as string,
        scopeValues: [...a.scopeValues],
      })),
      uniformScope: g.uniformScope
        ? {
            scope: g.uniformScope.scope as string,
            scopeValues: [...g.uniformScope.scopeValues],
          }
        : null,
    })),
    plants: u.userPlants.map((up) => ({
      id: up.plant.id,
      code: up.plant.code,
      name: up.plant.name as LocalizedText | null,
      isActive: up.plant.isActive,
    })),
  };
}

/**
 * 初期管理者（ローカル `admin`）の現況を 1 回のクエリ束で読む。
 *
 * 「他に管理者が居るか」は **user_permissions ビュー**で数える（roles テーブルの
 * `admin` ロール名ではなく）。ロール名は運用で増減しうるが、実際に管理できるか
 * どうかは `system:ADMIN` を持つかどうかで決まるため。ビューは users.is_active も
 * 見ているので、無効化されたユーザーは自動的に数から外れる。
 */
export async function getBootstrapAdminSnapshot(): Promise<{
  id: string;
  isActive: boolean;
  passwordChangeRequired: boolean;
  otherActiveAdminCount: number;
} | null> {
  const u = await prisma.user.findUnique({
    where: { username: BOOTSTRAP_ADMIN_USERNAME },
    select: { id: true, isActive: true, passwordChangeRequired: true },
  });
  if (!u) return null;
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT user_id) AS n
    FROM app.user_permissions
    WHERE permission_code = 'system'
      AND action = 'ADMIN'
      AND user_id <> ${u.id}::uuid`;
  return {
    id: u.id,
    isActive: u.isActive,
    passwordChangeRequired: u.passwordChangeRequired,
    otherActiveAdminCount: Number(rows[0]?.n ?? 0),
  };
}

/**
 * 対象**以外**で system:ADMIN を持つ有効ユーザー数と、対象自身が管理者かどうか。
 *
 * 「管理者を全滅させない」ガードの土台。ロール名（`admin`）ではなく
 * user_permissions ビュー = 実効権限で数えるのは、ロール構成が変わっても
 * 「実際に管理できる人が居るか」という問いの答えが変わらないため。
 * ビューは users.is_active を JOIN 済みなので、停止中の管理者は数に入らない。
 *
 * ⚠️ **GROUP BY にプレースホルダを含む式を書かないこと**。
 * `$queryRaw` のテンプレートは補間ごとに別のパラメータを作るので、
 * `SELECT (user_id = ${id}) … GROUP BY (user_id = ${id})` は SQL 上
 * `$1` と `$2` になり、PostgreSQL から見て「同じ式」ではなくなる。結果
 * `column "user_permissions.user_id" must appear in the GROUP BY clause`
 * で**必ず**失敗する（SY01 の詳細画面が常に 500 になっていた原因）。
 * 集計は FILTER で 1 行に畳んで、GROUP BY 自体を無くしてある。
 */
export async function getAdminCoverage(targetUserId: string): Promise<{
  targetIsAdmin: boolean;
  otherActiveAdminCount: number;
}> {
  // 呼び出し側（詳細ページ）は getAdminUser と Promise.all で並走させるため、
  // ここで弾かないと不正な id で notFound() より先に SQL が落ちて 500 になる。
  if (!UUID_RE.test(targetUserId)) {
    return { targetIsAdmin: false, otherActiveAdminCount: 0 };
  }
  const rows = await prisma.$queryRaw<
    { target_is_admin: boolean; other_count: bigint }[]
  >`
    SELECT COUNT(DISTINCT user_id) FILTER (
             WHERE user_id = ${targetUserId}::uuid
           ) > 0 AS target_is_admin,
           COUNT(DISTINCT user_id) FILTER (
             WHERE user_id <> ${targetUserId}::uuid
           ) AS other_count
      FROM app.user_permissions
     WHERE permission_code = 'system'
       AND action = 'ADMIN'`;
  const row = rows[0];
  return {
    targetIsAdmin: row?.target_is_admin === true,
    otherActiveAdminCount: Number(row?.other_count ?? 0),
  };
}
