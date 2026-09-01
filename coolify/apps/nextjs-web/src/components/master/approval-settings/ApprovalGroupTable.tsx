"use client";

/**
 * ApprovalGroupTable.tsx — 承認グループ 一覧 (MS0B, design.md §8.1 / §14).
 *
 * 列: 名称 / 種別 / メンバー数 / 状態。種別 + 状態フィルタ、
 * 一括有効化・無効化・削除。
 */

import { Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
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
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteApprovalGroups,
  setApprovalGroupsActive,
} from "@/app/(dashboard)/master/approval-settings/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type ApprovalGroupModalTarget,
  DeleteApprovalGroupModal,
  ToggleApprovalGroupActiveModal,
} from "./ApprovalGroupModals";

const BASE_PATH = "/master/approval-settings";

/** 種別バッジ（FIRST=blue / SECOND=violet / WORKFLOW_CHANGE=orange）。 */
export interface ApprovalGroupRow {
  id: number;
  name: string;
  memberCount: number;
  isActive: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function ApprovalGroupTable({
  rows,
  /** タブの中で使うとき true — 画面ヘッダは親が 1 つだけ出す。 */
  embedded = false,
}: {
  rows: ApprovalGroupRow[];
  embedded?: boolean;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");

  const [deleteRow, setDeleteRow] = useState<ApprovalGroupModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<ApprovalGroupModalTarget | null>(
    null,
  );

  const reset = () => {
    setSearch(null);
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch = !search || r.name.includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesStatus;
  });

  const bulkSetActive = (targets: ApprovalGroupRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setApprovalGroupsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : tr("common.disabled2"),
          message: `${targets.length}件の承認グループを${isActive ? "有効化" : "無効化"}しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const bulkDelete = (targets: ApprovalGroupRow[]) => {
    openConfirm({
      title: tr("master.approvalSettings.bulkDeleteApprovalGroups"),
      message: `選択中の${targets.length}件の承認グループを削除します。この操作は取り消せません。`,
      confirmLabel: tr("common.delete2"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteApprovalGroups(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: `${targets.length}件の承認グループを削除しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: tr("common.error2"),
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
      header: tr("common.name2"),
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "memberCount",
      header: tr("common.members"),
      sortable: true,
      hideable: true,
      width: 110,
      align: "right",
      sortValue: (r) => r.memberCount,
      render: (r) => `${r.memberCount}名`,
    },
    {
      key: "isActive",
      header: tr("common.status"),
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("common.masterData"), tr("common.approvalSettings")]}
      embedded={embedded}
      filters=<Select
        clearable
        data={STATUS_OPTIONS}
        onChange={setStatusFilter}
        placeholder={tr("common.status")}
        style={isMobile ? { flex: 1 } : undefined}
        value={statusFilter}
        w={isMobile ? undefined : 120}
      />
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("master.approvalSettings.searchByName")}
          value={search}
        />
      }
      title={tr("common.approvalSettings")}
    >
      <DataTable
        bulkActions={[
          {
            label: tr("common.bulkEnable"),
            icon: <IconCheck size={16} />,
            color: "green",
            onAction: (rs) => bulkSetActive(rs, true),
          },
          {
            label: tr("common.bulkDisable"),
            icon: <IconCircleMinus size={16} />,
            color: "orange",
            onAction: (rs) => bulkSetActive(rs, false),
          },
          {
            label: tr("common.bulkDelete"),
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
        emptyMessage={tr("master.approvalSettings.thereAreNoApprovalGroups")}
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Text c="dimmed" size="xs">
                  {r.memberCount}名
                </Text>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        rowActions={(row) => [
          {
            label: tr("common.edit2"),
            icon: <IconEdit size={14} />,
            onAction: (r) => router.push(`${BASE_PATH}/${r.id}/edit`),
          },
          {
            label: row.isActive ? "無効化" : tr("common.enable"),
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
        urlState
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
