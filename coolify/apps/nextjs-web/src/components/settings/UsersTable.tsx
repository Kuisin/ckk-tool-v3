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
import { useLocale, useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { localized } from "@/lib/format";
import { listSearchMatch } from "@/lib/list-search";
import type { AdminUserRow } from "@/lib/users-admin";

export function userGroupLabels(
  tr: ReturnType<typeof useTranslations>,
): Record<AdminUserRow["group"], string> {
  return {
    SYSTEM: tr("common.system"),
    EMPLOYEE: tr("settings.usersTable.employee"),
    GUEST: tr("common.guest"),
  };
}

const GROUP_COLORS: Record<AdminUserRow["group"], string> = {
  SYSTEM: "dark",
  EMPLOYEE: "blue",
  GUEST: "orange",
};

export function UserGroupBadge({ group }: { group: AdminUserRow["group"] }) {
  const tr = useTranslations();
  return (
    <Badge color={GROUP_COLORS[group]} variant="light">
      {userGroupLabels(tr)[group]}
    </Badge>
  );
}

export function UserActiveBadge({ isActive }: { isActive: boolean }) {
  const tr = useTranslations();
  return (
    <Badge color={isActive ? "green" : "gray"} variant="light">
      {isActive ? tr("common.enabled") : tr("common.disabled3")}
    </Badge>
  );
}

/**
 * バッジに出す表示（= 検索の対象）。表示名が無いロールは rolename を出すので、
 * 検索も同じ 1 本から作る — 「見えている文字で探せない」を作らないため。
 */
function roleBadgeLabel(
  role: AdminUserRow["roles"][number],
  locale: string,
): string {
  const label = localized(role.displayName, locale);
  return label === "—" ? role.rolename : label;
}

export function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const locale = useLocale();

  const [search, setSearch] = useUrlStringState("q");
  const [group, setGroup] = useUrlSelectState("group");
  const [active, setActive] = useUrlSelectState("active");

  const reset = () => {
    setSearch(null);
    setGroup(null);
    setActive(null);
  };

  const filtered = rows.filter((r) => {
    // ロールは **バッジに出ている表示名**でも引けること。rolename（`staff` 等）
    // だけを見ていたので、画面に「一般」と出ているのに「一般」で 0 件になっていた。
    const matchesSearch = listSearchMatch(search, [
      r.username,
      r.displayName,
      r.email,
      ...r.roles.map((role) => roleBadgeLabel(role, locale)),
      ...r.roles.map((role) => role.rolename),
    ]);
    const matchesGroup = !group || r.group === group;
    const matchesActive =
      !active || (active === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesGroup && matchesActive;
  });

  const columns: Column<AdminUserRow>[] = [
    {
      key: "username",
      header: tr("common.username"),
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
      header: tr("common.displayName"),
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
      header: tr("common.email"),
      hideable: true,
      render: (r) => (
        <Text c={r.email ? undefined : "dimmed"} size="sm">
          {r.email ?? "—"}
        </Text>
      ),
    },
    {
      key: "group",
      header: tr("common.type"),
      width: 100,
      render: (r) => <UserGroupBadge group={r.group} />,
    },
    {
      key: "roles",
      header: tr("common.role"),
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
                {roleBadgeLabel(role, locale)}
              </Badge>
            ))}
          </Group>
        ),
    },
    {
      key: "isActive",
      header: tr("common.status"),
      width: 90,
      sortable: true,
      render: (r) => <UserActiveBadge isActive={r.isActive} />,
      sortValue: (r) => (r.isActive ? 0 : 1),
    },
    {
      key: "lastLoginAt",
      header: tr("common.lastLogin"),
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
      breadcrumbs={[tr("common.system"), tr("common.users")]}
      filters={
        <>
          <Select
            clearable
            data={Object.entries(userGroupLabels(tr)).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={setGroup}
            placeholder={tr("common.type")}
            value={group}
            w={140}
          />
          <Select
            clearable
            data={[
              { value: "active", label: tr("common.enabled") },
              { value: "inactive", label: tr("common.disabled3") },
            ]}
            onChange={setActive}
            placeholder={tr("common.status")}
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
          placeholder={tr("settings.usersTable.usernameDisplayNameEmailRole")}
          value={search}
        />
      }
      title={tr("common.users")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        emptyIcon={<IconUserCog size={28} />}
        emptyMessage={tr("settings.usersTable.noMatchingUsers")}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/settings/users/${r.id}`)}
        urlState
      />
    </ListShell>
  );
}
