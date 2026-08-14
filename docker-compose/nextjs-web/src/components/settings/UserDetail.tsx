"use client";

/**
 * UserDetail — ユーザー管理（SY01）の詳細。読み取り専用。
 *
 * プロフィール概要 + ロール割当履歴（user_role_relation）+ 実効権限
 * （user_permissions ビュー = 有効ロール経由の全 grant 行）を表示する。
 */

import { Badge, Paper, Table, Text, Title } from "@mantine/core";
import {
  UserActiveBadge,
  UserGroupBadge,
} from "@/components/settings/UsersTable";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import { formatDateTime, localized } from "@/lib/format";
import type { AdminUserDetail } from "@/lib/users-admin";

function roleLabel(role: {
  rolename: string;
  displayName: AdminUserDetail["roles"][number]["displayName"];
}): string {
  const label = localized(role.displayName);
  return label === "—" ? role.rolename : label;
}

export function UserDetail({ user }: { user: AdminUserDetail }) {
  return (
    <DetailShell
      breadcrumbs={[
        "システム",
        { label: "ユーザー管理", href: "/settings/users" },
      ]}
      createdAt={user.createdAt ? formatDateTime(user.createdAt) : undefined}
      status={<UserActiveBadge isActive={user.isActive} />}
      title={user.displayName}
      updatedAt={user.updatedAt ? formatDateTime(user.updatedAt) : undefined}
    >
      <SummaryGrid>
        <FieldValue
          label="ユーザー名"
          value={<Text ff="mono">{user.username}</Text>}
        />
        <FieldValue
          label="区分"
          value={<UserGroupBadge group={user.group} />}
        />
        <FieldValue label="メール" value={user.email ?? "—"} />
        <FieldValue
          label="ログイン方式"
          value={user.hasPassword ? "パスワード + SSO" : "SSO のみ"}
        />
        <FieldValue
          label="最終ログイン"
          value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
        />
        <FieldValue
          label="社員 ID"
          value={
            user.employeeId ? <Text ff="mono">{user.employeeId}</Text> : "—"
          }
        />
      </SummaryGrid>

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          ロール割当
        </Title>
        {user.assignments.length === 0 ? (
          <Text c="dimmed" size="sm">
            ロールが割り当てられていません
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={480}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ロール</Table.Th>
                  <Table.Th>rolename</Table.Th>
                  <Table.Th>状態</Table.Th>
                  <Table.Th>割当日</Table.Th>
                  <Table.Th>解除日時</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {user.assignments.map((a) => (
                  <Table.Tr key={a.rolename}>
                    <Table.Td>
                      <Text fw={500} size="sm">
                        {roleLabel(a)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c="dimmed" ff="mono" size="sm">
                        {a.rolename}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <UserActiveBadge isActive={a.isActive} />
                    </Table.Td>
                    <Table.Td>
                      <Text c="dimmed" size="sm">
                        {a.assignedAt ? formatDateTime(a.assignedAt) : "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c="dimmed" size="sm">
                        {a.deactivateAt ? formatDateTime(a.deactivateAt) : "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          実効権限
        </Title>
        <Text c="dimmed" mb="sm" size="xs">
          user_permissions ビュー（有効ロール経由の全 grant —
          実効アクセスは全行の和集合）
        </Text>
        {user.permissions.length === 0 ? (
          <Text c="dimmed" size="sm">
            権限がありません
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={420}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>権限コード</Table.Th>
                  <Table.Th>アクション</Table.Th>
                  <Table.Th>スコープ</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {user.permissions.map((p, i) => (
                  <Table.Tr
                    key={`${p.permissionCode}:${p.action}:${p.scope}:${i}`}
                  >
                    <Table.Td>
                      <Text ff="mono" size="sm">
                        {p.permissionCode}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color="blue" variant="light">
                        {p.action}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text ff="mono" size="sm">
                        {p.scope}
                        {(p.scope === "PLANT" || p.scope === "REGION") &&
                        !(
                          p.scopeValues.length === 1 && p.scopeValues[0] === "*"
                        )
                          ? ` (${p.scopeValues.join(", ")})`
                          : ""}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </DetailShell>
  );
}
