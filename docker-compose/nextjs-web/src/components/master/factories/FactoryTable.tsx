"use client";

/**
 * FactoryTable.tsx — 工場 一覧 (MS0B, design.md §8.1 / §13.6 / §14).
 *
 * 列: コード / 名称（ja） / 国 / 状態 / 更新日。app.factories を Prisma で
 * 取得したサーバーデータを表示する。
 */

import { Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBuildingWarehouse,
  IconCheck,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteFactories,
  setFactoriesActive,
} from "@/app/(dashboard)/master/factories/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { COUNTRY_LABEL } from "@/lib/enum-labels";
import { formatDate } from "@/lib/format";
import {
  DeleteFactoryModal,
  type FactoryModalTarget,
  ToggleFactoryActiveModal,
} from "./FactoryModals";

const BASE_PATH = "/master/factories";

export interface FactoryRow {
  id: number;
  code: string;
  name: string;
  countryCode: string | null;
  isActive: boolean;
  /** ISO timestamp */
  updatedAt: string;
}

function countryLabel(code: string | null): string {
  if (!code) return "—";
  return COUNTRY_LABEL[code] ?? code;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function FactoryTable({ rows }: { rows: FactoryRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");

  const [deleteRow, setDeleteRow] = useState<FactoryModalTarget | null>(null);
  const [toggleRow, setToggleRow] = useState<FactoryModalTarget | null>(null);

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

  const bulkSetActive = (targets: FactoryRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setFactoriesActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : "無効化しました",
          message: `${targets.length}件の工場を${isActive ? "有効化" : "無効化"}しました`,
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

  const bulkDelete = (targets: FactoryRow[]) => {
    openConfirm({
      title: "工場の一括削除",
      message: `選択中の${targets.length}件の工場を削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteFactories(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `${targets.length}件の工場を削除しました`,
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

  const columns: Column<FactoryRow>[] = [
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
      key: "country",
      header: "国",
      sortable: true,
      hideable: true,
      width: 110,
      sortValue: (r) => countryLabel(r.countryCode),
      render: (r) => countryLabel(r.countryCode),
    },
    {
      key: "isActive",
      header: "状態",
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
    {
      key: "updatedAt",
      header: "更新日",
      sortable: true,
      hideable: true,
      width: 120,
      sortValue: (r) => r.updatedAt,
      render: (r) => formatDate(r.updatedAt),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["マスタ", "工場"]}
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
      title="工場"
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
        defaultSort={{ key: "code", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconBuildingWarehouse size={24} />}
        emptyMessage="工場がありません"
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.code}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Group gap="md" mt={2}>
                  <Text c="dimmed" size="xs">
                    {countryLabel(r.countryCode)}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {formatDate(r.updatedAt)}
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
        urlState
      />

      <DeleteFactoryModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleFactoryActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
