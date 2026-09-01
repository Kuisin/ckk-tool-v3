"use client";

/**
 * BpTable.tsx — 取引先 一覧 (MS01, design.md §8.1 / §14).
 *
 * 顧客 / 最終需要家 / 仕入先・外注先 は同じ台帳の「ロール」なので 1 つの一覧に
 * まとめ、ロールで絞り込む。行は法人（トップレベル BP）— 支店は詳細の
 * 「支店一覧」タブに出る。
 */

import { Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBuilding,
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
  deleteBps,
  setBpsActive,
} from "@/app/(dashboard)/master/_shared/bp-actions";
import type { BpRow } from "@/app/(dashboard)/master/_shared/bp-data";
import { BP_BASE_PATH } from "@/app/(dashboard)/master/_shared/bp-paths";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  type BpModalTarget,
  DeleteBpModal,
  ToggleBpActiveModal,
} from "@/components/master/bp/BpModals";
import { BpRoleBadges } from "@/components/master/bp/BpRoleBadges";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { bpMatchesQuery } from "@/lib/bp-search";
import { bpRoleOptions } from "@/lib/enum-labels";

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function BpTable({ rows }: { rows: BpRow[] }) {
  const tr = useTr();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [roleFilter, setRoleFilter] = useUrlSelectState("role");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");

  const [deleteRow, setDeleteRow] = useState<BpModalTarget | null>(null);
  const [toggleRow, setToggleRow] = useState<BpModalTarget | null>(null);

  const reset = () => {
    setSearch(null);
    setRoleFilter(null);
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    // 社名だけでなく照合キー（フリガナ・ローマ字・表記ゆれ）でも当てる。
    const matchesSearch = bpMatchesQuery(
      { bpCode: r.bpCode, nameJa: r.name, matchNames: r.searchKeys },
      search ?? "",
    );
    const matchesRole =
      !roleFilter || r.roles.includes(roleFilter as BpRow["roles"][number]);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const bulkSetActive = (targets: BpRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setBpsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : tr("無効化しました"),
          message: `${targets.length}件の取引先を${isActive ? "有効化" : "無効化"}しました`,
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

  const bulkDelete = (targets: BpRow[]) => {
    openConfirm({
      title: tr("取引先の一括削除"),
      message: `選択中の${targets.length}件の取引先を削除します。この操作は取り消せません。`,
      confirmLabel: tr("削除する"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteBps(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: `${targets.length}件の取引先を削除しました`,
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

  const columns: Column<BpRow>[] = [
    {
      key: "bpCode",
      header: tr("BPコード"),
      sortable: true,
      width: 130,
      render: (r) => <DocNumber>{r.bpCode}</DocNumber>,
    },
    {
      key: "name",
      header: tr("名称"),
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "roles",
      header: tr("ロール"),
      width: 220,
      render: (r) => <BpRoleBadges roles={r.roles} vendorType={r.vendorType} />,
    },
    {
      key: "branchCount",
      header: tr("支店数"),
      sortable: true,
      hideable: true,
      width: 90,
      sortValue: (r) => r.branchCount,
      render: (r) => (r.branchCount > 0 ? `${r.branchCount} 支店` : "—"),
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
      action={<NewButton href={`${BP_BASE_PATH}/new`} />}
      breadcrumbs={[tr("マスタ"), tr("取引先")]}
      filters={
        <>
          <Select
            clearable
            data={bpRoleOptions(locale)}
            onChange={setRoleFilter}
            placeholder={tr("ロール")}
            value={roleFilter}
            w={isMobile ? 130 : 160}
          />
          <Select
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder={tr("状態")}
            value={statusFilter}
            w={isMobile ? 110 : 120}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("BPコード・名称で検索")}
          value={search}
        />
      }
      title={tr("取引先")}
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
        defaultSort={{ key: "bpCode", dir: "asc" }}
        emptyAction={<NewButton href={`${BP_BASE_PATH}/new`} />}
        emptyIcon={<IconBuilding size={24} />}
        emptyMessage={tr("取引先がありません")}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BP_BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.bpCode}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <BpRoleBadges roles={r.roles} vendorType={r.vendorType} />
                <Group gap="md" mt={2}>
                  <Text c="dimmed" size="xs">
                    {r.branchCount > 0
                      ? `${r.branchCount} 支店`
                      : tr("支店なし")}
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
            onAction: (r) => router.push(`${BP_BASE_PATH}/${r.id}/edit`),
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

      <DeleteBpModal
        entityLabel={tr("取引先")}
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleBpActiveModal
        entityLabel={tr("取引先")}
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
