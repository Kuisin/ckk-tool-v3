"use client";

/**
 * DefectTypeTable.tsx — 不良種類 一覧 (MS0A, design.md §8.1 / §14).
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
import { useTranslations } from "next-intl";
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
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
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
  nameTranslations: Record<string, string>;
  sortOrder: number;
  isActive: boolean;
}

export function DefectTypeTable({ rows }: { rows: DefectTypeRow[] }) {
  const tr = useTranslations();
  const STATUS_OPTIONS = [
    { value: "active", label: tr("common.enabled") },
    { value: "inactive", label: tr("common.disabled") },
  ];
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");

  const [editRow, setEditRow] = useState<DefectTypeModalTarget | null>(null);
  const [deleteRow, setDeleteRow] = useState<DefectTypeModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<DefectTypeModalTarget | null>(
    null,
  );

  const reset = () => {
    setSearch(null);
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
          title: isActive ? tr("common.enabled2") : tr("common.disabled2"),
          message: isActive
            ? tr("master.defectTypes.bulkEnabled", { count: targets.length })
            : tr("master.defectTypes.bulkDisabled", {
                count: targets.length,
              }),
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

  const bulkDelete = (targets: DefectTypeRow[]) => {
    openConfirm({
      title: tr("master.defectTypes.bulkDeleteDefectTypes"),
      message: tr("master.defectTypes.bulkDeleteConfirm", {
        count: targets.length,
      }),
      confirmLabel: tr("common.delete2"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteDefectTypes(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.defectTypes.bulkDeleted", {
                count: targets.length,
              }),
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

  const columns: Column<DefectTypeRow>[] = [
    {
      key: "code",
      header: tr("common.code"),
      sortable: true,
      width: 140,
      sortValue: (r) => r.code,
      render: (r) => <DocNumber>{r.code}</DocNumber>,
    },
    {
      key: "name",
      header: tr("common.name2"),
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "sortOrder",
      header: tr("common.sortOrder"),
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
      breadcrumbs={[tr("common.masterData"), tr("common.defectTypes")]}
      filters={
        <Select
          clearable
          data={STATUS_OPTIONS}
          onChange={setStatusFilter}
          placeholder={tr("common.status")}
          value={statusFilter}
          w={isMobile ? 110 : 120}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("common.searchByCodeOrName")}
          value={search}
        />
      }
      title={tr("common.defectTypes")}
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
        defaultSort={{ key: "sortOrder", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconAlertTriangle size={24} />}
        emptyMessage={tr("master.defectTypes.thereAreNoDefectTypes")}
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
                  {tr("master.defectTypes.sortOrderValue", {
                    value: r.sortOrder,
                  })}
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
            onAction: (r) => setEditRow(r),
          },
          {
            label: row.isActive ? tr("common.disable") : tr("common.enable"),
            icon: <IconCircleMinus size={14} />,
            onAction: (r) => setToggleRow(r),
          },
          {
            label: tr("common.delete"),
            icon: <IconTrash size={14} />,
            color: "red",
            onAction: (r) => setDeleteRow(r),
          },
        ]}
        selectable
        urlState
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
