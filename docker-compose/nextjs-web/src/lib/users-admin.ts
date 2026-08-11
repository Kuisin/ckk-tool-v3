import "server-only";

/**
 * users-admin.ts — ユーザー管理（SY01）のデータ取得。server-only・読み取り専用。
 *
 * app.users + ロール割当（user_role_relation）+ 実効権限（user_permissions
 * ビュー — 集約済み・最上位スコープのみ）を提供する。閲覧は RBAC
 * （system:READ）でゲート — 呼び出し側ページで checkPermission を通すこと。
 */

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
  scopeCustom: number | null;
}

export interface AdminUserDetail extends AdminUserRow {
  employeeId: string | null;
  /** credentials ログイン可否（false = SSO のみ）。ハッシュ自体は返さない。 */
  hasPassword: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  assignments: AdminUserAssignment[];
  permissions: AdminUserPermission[];
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
    },
  });
  if (!u) return null;
  const permissions = await prisma.$queryRaw<
    {
      permission_code: string;
      action: string;
      scope: string;
      scope_custom: number | null;
    }[]
  >`
    SELECT permission_code, action::text AS action, scope::text AS scope, scope_custom
    FROM app.user_permissions
    WHERE user_id = ${id}::uuid
    ORDER BY permission_code, action`;
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
      scopeCustom: p.scope_custom,
    })),
  };
}
