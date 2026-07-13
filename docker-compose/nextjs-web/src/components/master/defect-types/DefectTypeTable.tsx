"use client";

/**
 * DefectTypeTable.tsx — 不良種類 一覧 (MS09, design.md §8.1 / §14).
 *
 * 列: コード / 名称 / 表示順 / 状態。詳細ページを持たない小マスタのため、
 * 行クリック・行アクションの「編集」はモーダルで完結する。
 */

import { Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteDefectTypes,
  setDefectTypesActive,
} from "@/app/(dashboard)/master/defect-types/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type DefectTypeModalTarget,
  DeleteDefectTypeModal,
  EditDefectTypeModal,
  ToggleDefectTypeActiveModal,
} from "./DefectTypeModals";

const BASE_PATH = "/master/defect-types";

export interface DefectTypeRow {
  id: number;
  code: string;
  /** 表示名（現ロケール解決済み） */
  name: string;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function DefectTypeTable({ rows }: { rows: DefectTypeRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [editRow, setEditRow] = useState<DefectTypeModalTarget | null>(null);
  const [deleteRow, setDeleteRow] = useState<DefectTypeModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<DefectTypeModalTarget | null>(
    null,
  );

  const reset = () => {
    setSearch("");
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search || r.code.includes(search) || r.name.includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesStatus;
  });

  const bulkSetActive = (targets: DefectTypeRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setDefectTypesActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : "無効化しました",
          message: `${targets.length}件の不良種類を${isActive ? "有効化" : "無効化"}しました`,
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

  const bulkDelete = (targets: DefectTypeRow[]) => {
    openConfirm({
      title: "不良種類の一括削除",
      message: `選択中の${targets.length}件の不良種類を削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteDefectTypes(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `${targets.length}件の不良種類を削除しました`,
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

  const columns: Column<DefectTypeRow>[] = [
    {
      key: "code",
      header: "コード",
      sortable: true,
      width: 140,
      sortValue: (r) => r.code,
      render: (r) => <DocNumber>{r.code}</DocNumber>,
    },
    {
      key: "name",
      header: "名称",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "sortOrder",
      header: "表示順",
      sortable: true,
      hideable: true,
      align: "right",
      width: 90,
      sortValue: (r) => r.sortOrder,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.sortOrder}
        </Text>
      ),
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
      breadcrumbs={["マスタ", "不良種類"]}
      filters={
        <Select
          clearable
          data={STATUS_OPTIONS}
          onChange={setStatusFilter}
          placeholder="状態"
          value={statusFilter}
          w={isMobile ? 110 : 120}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="コード・名称で検索"
          value={search}
        />
      }
      title="不良種類"
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
        defaultSort={{ key: "sortOrder", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconAlertTriangle size={24} />}
        emptyMessage="不良種類がありません"
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => setEditRow(r)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.code}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Text c="dimmed" size="xs">
                  表示順 {r.sortOrder}
                </Text>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        rowActions={(row) => [
          {
            label: "編集",
            icon: <IconEdit size={14} />,
            onAction: (r) => setEditRow(r),
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

      <EditDefectTypeModal
        onClose={() => setEditRow(null)}
        onDone={() => router.refresh()}
        opened={!!editRow}
        target={editRow}
      />
      <DeleteDefectTypeModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleDefectTypeActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
