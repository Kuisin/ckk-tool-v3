"use client";

/**
 * UsersTable — ユーザー管理（SY01, /settings/users）の一覧。
 *
 * app.users をロールバッジ付きで一覧表示する。行クリックで詳細
 * （/settings/users/[id] — ロール割当・実効権限）へ。読み取り専用。
 */

import { Badge, Group, Select, Text, TextInput } from "@mantine/core";
import { IconSearch, IconUserCog } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { localized } from "@/lib/format";
import type { AdminUserRow } from "@/lib/users-admin";

export const USER_GROUP_LABELS: Record<AdminUserRow["group"], string> = {
  SYSTEM: "システム",
  EMPLOYEE: "社員",
  GUEST: "ゲスト",
};

const GROUP_COLORS: Record<AdminUserRow["group"], string> = {
  SYSTEM: "dark",
  EMPLOYEE: "blue",
  GUEST: "orange",
};

export function UserGroupBadge({ group }: { group: AdminUserRow["group"] }) {
  return (
    <Badge color={GROUP_COLORS[group]} variant="light">
      {USER_GROUP_LABELS[group]}
    </Badge>
  );
}

export function UserActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge color={isActive ? "green" : "gray"} variant="light">
      {isActive ? "有効" : "無効"}
    </Badge>
  );
}

export function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const fmt = useFormat();
  const router = useRouter();

  const [search, setSearch] = useUrlStringState("q");
  const [group, setGroup] = useUrlSelectState("group");
  const [active, setActive] = useUrlSelectState("active");

  const reset = () => {
    setSearch(null);
    setGroup(null);
    setActive(null);
  };

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      r.username.toLowerCase().includes(q) ||
      r.displayName.toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      r.roles.some((role) => role.rolename.toLowerCase().includes(q));
    const matchesGroup = !group || r.group === group;
    const matchesActive =
      !active || (active === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesGroup && matchesActive;
  });

  const columns: Column<AdminUserRow>[] = [
    {
      key: "username",
      header: "ユーザー名",
      sortable: true,
      width: 180,
      render: (r) => (
        <Text ff="mono" size="sm">
          {r.username}
        </Text>
      ),
      sortValue: (r) => r.username,
    },
    {
      key: "displayName",
      header: "表示名",
      sortable: true,
      render: (r) => (
        <Text fw={500} size="sm">
          {r.displayName}
        </Text>
      ),
      sortValue: (r) => r.displayName,
    },
    {
      key: "email",
      header: "メール",
      hideable: true,
      render: (r) => (
        <Text c={r.email ? undefined : "dimmed"} size="sm">
          {r.email ?? "—"}
        </Text>
      ),
    },
    {
      key: "group",
      header: "区分",
      width: 100,
      render: (r) => <UserGroupBadge group={r.group} />,
    },
    {
      key: "roles",
      header: "ロール",
      truncate: false,
      render: (r) =>
        r.roles.length === 0 ? (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ) : (
          <Group gap={4} wrap="wrap">
            {r.roles.map((role) => (
              <Badge color="gray" key={role.rolename} variant="light">
                {localized(role.displayName) === "—"
                  ? role.rolename
                  : localized(role.displayName)}
              </Badge>
            ))}
          </Group>
        ),
    },
    {
      key: "isActive",
      header: "状態",
      width: 90,
      sortable: true,
      render: (r) => <UserActiveBadge isActive={r.isActive} />,
      sortValue: (r) => (r.isActive ? 0 : 1),
    },
    {
      key: "lastLoginAt",
      header: "最終ログイン",
      width: 150,
      sortable: true,
      render: (r) => (
        <Text c="dimmed" size="sm">
          {r.lastLoginAt ? fmt.dateTime(r.lastLoginAt) : "—"}
        </Text>
      ),
      sortValue: (r) => r.lastLoginAt ?? "",
    },
  ];

  return (
    <ListShell
      breadcrumbs={["システム", "ユーザー管理"]}
      filters={
        <>
          <Select
            clearable
            data={Object.entries(USER_GROUP_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={setGroup}
            placeholder="区分"
            value={group}
            w={140}
          />
          <Select
            clearable
            data={[
              { value: "active", label: "有効" },
              { value: "inactive", label: "無効" },
            ]}
            onChange={setActive}
            placeholder="状態"
            value={active}
            w={120}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value || null)}
          placeholder="ユーザー名 / 表示名 / メール / ロール..."
          value={search}
        />
      }
      title="ユーザー管理"
    >
      <DataTable
        columns={columns}
        data={filtered}
        emptyIcon={<IconUserCog size={28} />}
        emptyMessage="該当するユーザーがありません"
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/settings/users/${r.id}`)}
        urlState
      />
    </ListShell>
  );
}
