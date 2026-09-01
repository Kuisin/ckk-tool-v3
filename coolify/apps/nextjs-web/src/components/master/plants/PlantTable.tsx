"use client";

/**
 * PlantTable.tsx — 拠点 一覧 (MS0C, design.md §8.1 / §13.6 / §14).
 *
 * 列: コード / 名称（ja） / 国 / 状態 / 更新日。app.plants を Prisma で
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
import { useLocale } from "next-intl";
import { useState, useTransition } from "react";
import {
  deletePlants,
  setPlantsActive,
} from "@/app/(dashboard)/master/plants/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { countryLabel } from "@/lib/enum-labels";
import type { Locale } from "@/lib/i18n";
import {
  DeletePlantModal,
  type PlantModalTarget,
  TogglePlantActiveModal,
} from "./PlantModals";

const BASE_PATH = "/master/plants";

export interface PlantRow {
  id: number;
  code: string;
  name: string;
  countryCode: string | null;
  /** 地域名（コード + 名称）。未設定は null。 */
  regionName: string | null;
  isActive: boolean;
  /** ISO timestamp */
  updatedAt: string;
}

function plantCountryLabel(code: string | null, locale: Locale): string {
  if (!code) return "—";
  return countryLabel(code, locale);
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function PlantTable({ rows }: { rows: PlantRow[] }) {
  const tr = useTr();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const locale = useLocale();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");

  const [deleteRow, setDeleteRow] = useState<PlantModalTarget | null>(null);
  const [toggleRow, setToggleRow] = useState<PlantModalTarget | null>(null);

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

  const bulkSetActive = (targets: PlantRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setPlantsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : tr("無効化しました"),
          message: `${targets.length}件の拠点を${isActive ? "有効化" : "無効化"}しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  const bulkDelete = (targets: PlantRow[]) => {
    openConfirm({
      title: tr("拠点の一括削除"),
      message: `選択中の${targets.length}件の拠点を削除します。この操作は取り消せません。`,
      confirmLabel: tr("削除する"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deletePlants(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: `${targets.length}件の拠点を削除しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
              color: "red",
            });
          }
        });
      },
    });
  };

  const columns: Column<PlantRow>[] = [
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
      header: tr("名称"),
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "country",
      header: tr("国"),
      sortable: true,
      hideable: true,
      width: 110,
      sortValue: (r) => plantCountryLabel(r.countryCode, locale),
      render: (r) => plantCountryLabel(r.countryCode, locale),
    },
    {
      key: "region",
      header: tr("地域"),
      sortable: true,
      hideable: true,
      width: 130,
      sortValue: (r) => r.regionName ?? "",
      render: (r) => r.regionName ?? "—",
    },
    {
      key: "isActive",
      header: tr("状態"),
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
    {
      key: "updatedAt",
      header: tr("更新日"),
      sortable: true,
      hideable: true,
      width: 120,
      sortValue: (r) => r.updatedAt,
      render: (r) => fmt.date(r.updatedAt),
    },
  ];

  return (
    <ListShell
      action={
        <Group gap="xs" wrap="nowrap">
          <SecondaryButton href={`${BASE_PATH}/regions`}>
            {tr("地域管理")}
          </SecondaryButton>
          <NewButton href={`${BASE_PATH}/new`} />
        </Group>
      }
      breadcrumbs={[tr("マスタ"), "拠点"]}
      filters={
        <Select
          clearable
          data={STATUS_OPTIONS}
          onChange={setStatusFilter}
          placeholder={tr("状態")}
          value={statusFilter}
          w={isMobile ? 110 : 120}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("コード・名称で検索")}
          value={search}
        />
      }
      title="拠点"
    >
      <DataTable
        bulkActions={[
          {
            label: tr("一括有効化"),
            icon: <IconCheck size={16} />,
            color: "green",
            onAction: (rs) => bulkSetActive(rs, true),
          },
          {
            label: tr("一括無効化"),
            icon: <IconCircleMinus size={16} />,
            color: "orange",
            onAction: (rs) => bulkSetActive(rs, false),
          },
          {
            label: tr("一括削除"),
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
        emptyMessage={tr("拠点がありません")}
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
                    {plantCountryLabel(r.countryCode, locale)}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {fmt.date(r.updatedAt)}
                  </Text>
                </Group>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        rowActions={(row) => [
          {
            label: tr("編集"),
            icon: <IconEdit size={14} />,
            onAction: (r) => router.push(`${BASE_PATH}/${r.id}/edit`),
          },
          {
            label: row.isActive ? "無効化" : tr("有効化"),
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

      <DeletePlantModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <TogglePlantActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
