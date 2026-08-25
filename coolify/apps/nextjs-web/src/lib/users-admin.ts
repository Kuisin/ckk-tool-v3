import "server-only";

/**
 * users-admin.ts — ユーザー管理（SY01）のデータ取得。server-only・読み取り専用。
 *
 * app.users + ロール割当（user_role_relation）+ 実効権限（user_permissions
 * ビュー — 集約済み・最上位スコープのみ）を提供する。閲覧は RBAC
 * （system:READ）でゲート — 呼び出し側ページで checkPermission を通すこと。
 */

import { BOOTSTRAP_ADMIN_USERNAME } from "./bootstrap-admin-core";
import { prisma } from "./db";
import type { LocalizedText } from "./format";

export interface AdminUserRole {
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
  /** ISO 文字列（クライアント側で formatDateTime）。 */
  lastLoginAt: string | null;
  roles: AdminUserRole[];
}

export interface AdminUserAssignment extends AdminUserRole {
  isActive: boolean;
  assignedAt: string | null;
  deactivateAt: string | null;
}

export interface AdminUserPermission {
  permissionCode: string;
  action: string;
  scope: string;
  /** grant のスコープ対象コード（'*' = ワイルドカード）。ALL/OWN では無意味 */
  scopeValues: string[];
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
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    roles: u.roleAssignments.map((a) => ({
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
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    roles: activeAssignments.map((a) => ({
      rolename: a.role.rolename,
      displayName: a.role.displayName as LocalizedText | null,
    })),
    employeeId: u.employeeId,
    hasPassword: !!u.passwordHash,
    createdAt: u.createdAt?.toISOString() ?? null,
    updatedAt: u.updatedAt?.toISOString() ?? null,
    assignments: u.roleAssignments.map((a) => ({
      rolename: a.role.rolename,
      displayName: a.role.displayName as LocalizedText | null,
      isActive: a.isActive,
      assignedAt: a.assignedAt?.toISOString() ?? null,
      deactivateAt: a.deactivateAt?.toISOString() ?? null,
    })),
    permissions: permissions.map((p) => ({
      permissionCode: p.permission_code,
      action: p.action,
      scope: p.scope,
      scopeValues: p.scope_values ?? ["*"],
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
