"use client";

/**
 * ApprovalGroupTable.tsx — 承認グループ 一覧 (MS0A, design.md §8.1 / §14).
 *
 * 列: 名称 / 種別 / メンバー数 / 状態。種別 + 状態フィルタ、
 * 一括有効化・無効化・削除。
 */

import {
  Badge,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteApprovalGroups,
  setApprovalGroupsActive,
} from "@/app/(dashboard)/master/approval-groups/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  APPROVAL_GROUP_TYPE_LABEL,
  APPROVAL_GROUP_TYPE_OPTIONS,
} from "@/lib/enum-labels";
import {
  type ApprovalGroupModalTarget,
  DeleteApprovalGroupModal,
  ToggleApprovalGroupActiveModal,
} from "./ApprovalGroupModals";

const BASE_PATH = "/master/approval-groups";

/** 種別バッジ（FIRST=blue / SECOND=violet / WORKFLOW_CHANGE=orange）。 */
const TYPE_COLOR: Record<string, string> = {
  FIRST: "blue",
  SECOND: "violet",
  WORKFLOW_CHANGE: "orange",
};

export function ApprovalGroupTypeBadge({ type }: { type: string }) {
  return (
    <Badge color={TYPE_COLOR[type] ?? "gray"} variant="light">
      {APPROVAL_GROUP_TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

export interface ApprovalGroupRow {
  id: number;
  name: string;
  type: string;
  memberCount: number;
  isActive: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function ApprovalGroupTable({ rows }: { rows: ApprovalGroupRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteRow, setDeleteRow] = useState<ApprovalGroupModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<ApprovalGroupModalTarget | null>(
    null,
  );

  const reset = () => {
    setSearch("");
    setTypeFilter(null);
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch = !search || r.name.includes(search);
    const matchesType = !typeFilter || r.type === typeFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesType && matchesStatus;
  });

  const bulkSetActive = (targets: ApprovalGroupRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setApprovalGroupsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : "無効化しました",
          message: `${targets.length}件の承認グループを${isActive ? "有効化" : "無効化"}しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const bulkDelete = (targets: ApprovalGroupRow[]) => {
    openConfirm({
      title: "承認グループの一括削除",
      message: `選択中の${targets.length}件の承認グループを削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteApprovalGroups(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `${targets.length}件の承認グループを削除しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
          }
        });
      },
    });
  };

  const columns: Column<ApprovalGroupRow>[] = [
    {
      key: "name",
      header: "名称",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "type",
      header: "種別",
      sortable: true,
      width: 200,
      sortValue: (r) => r.type,
      render: (r) => <ApprovalGroupTypeBadge type={r.type} />,
    },
    {
      key: "memberCount",
      header: "メンバー数",
      sortable: true,
      hideable: true,
      width: 110,
      align: "right",
      sortValue: (r) => r.memberCount,
      render: (r) => `${r.memberCount}名`,
    },
    {
      key: "isActive",
      header: "状態",
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["マスタ", "承認グループ"]}
      filters={
        <>
          <Select
            clearable
            data={APPROVAL_GROUP_TYPE_OPTIONS}
            onChange={setTypeFilter}
            placeholder="種別"
            style={isMobile ? { flex: 1 } : undefined}
            value={typeFilter}
            w={isMobile ? undefined : 200}
          />
          <Select
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder="状態"
            style={isMobile ? { flex: 1 } : undefined}
            value={statusFilter}
            w={isMobile ? undefined : 120}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="名称で検索"
          value={search}
        />
      }
      title="承認グループ"
    >
      <DataTable
        bulkActions={[
          {
            label: "一括有効化",
            icon: <IconCheck size={16} />,
            color: "green",
            onAction: (rs) => bulkSetActive(rs, true),
          },
          {
            label: "一括無効化",
            icon: <IconCircleMinus size={16} />,
            color: "orange",
            onAction: (rs) => bulkSetActive(rs, false),
          },
          {
            label: "一括削除",
            icon: <IconTrash size={16} />,
            color: "red",
            onAction: bulkDelete,
          },
        ]}
        columns={columns}
        data={filtered}
        defaultSort={{ key: "name", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconUsersGroup size={24} />}
        emptyMessage="承認グループがありません"
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Group gap="md" mt={2}>
                  <ApprovalGroupTypeBadge type={r.type} />
                  <Text c="dimmed" size="xs">
                    {r.memberCount}名
                  </Text>
                </Group>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        rowActions={(row) => [
          {
            label: "編集",
            icon: <IconEdit size={14} />,
            onAction: (r) => router.push(`${BASE_PATH}/${r.id}/edit`),
          },
          {
            label: row.isActive ? "無効化" : "有効化",
            icon: <IconCircleMinus size={14} />,
            onAction: (r) => setToggleRow(r),
          },
          {
            label: "削除",
            icon: <IconTrash size={14} />,
            color: "red",
            onAction: (r) => setDeleteRow(r),
          },
        ]}
        selectable
      />

      <DeleteApprovalGroupModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleApprovalGroupActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
