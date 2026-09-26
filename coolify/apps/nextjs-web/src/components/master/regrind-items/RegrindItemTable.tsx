"use client";

/**
 * RegrindItemTable.tsx — 再研磨品目 一覧 (MS0H, design.md §8.1 / §14).
 *
 * 列: コード / 名称 / 工具の種類 / 加工箇所 / 刃数 / サイズ帯 / 標準価格 / 状態。
 * **条件の列を出す**のが要点 — 旧 再研マスタと同じで、どれを使うかは名前では
 * なく条件と値段で決まる。詳細ページを持たないので、行クリックと「編集」は
 * モーダルで完結する。
 */

import { Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTool,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteRegrindItems,
  setRegrindItemsActive,
} from "@/app/(dashboard)/master/regrind-items/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { MoneyText } from "@/components/ui/MoneyText";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  DeleteRegrindItemModal,
  EditRegrindItemModal,
  type RegrindItemModalTarget,
  ToggleRegrindItemActiveModal,
} from "./RegrindItemModals";

const BASE_PATH = "/master/regrind-items";

export interface RegrindItemRow extends RegrindItemModalTarget {
  /** 表示名（現ロケール解決済み）。 */
  name: string;
  /** サイズ帯の表示（「φ6 超 10 以下」）。 */
  sizeBand: string;
}

export function RegrindItemTable({
  rows,
  toolClassOptions,
  locationOptions,
}: {
  rows: RegrindItemRow[];
  /** 登録済みの工具の種類（自由記入なので、実際にある値だけを出す）。 */
  toolClassOptions: string[];
  /** 登録済みの加工箇所。 */
  locationOptions: string[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const STATUS_OPTIONS = [
    { value: "active", label: tr("common.enabled") },
    { value: "inactive", label: tr("common.disabled") },
  ];

  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");
  const [toolClassFilter, setToolClassFilter] = useUrlSelectState("toolClass");
  const [locationFilter, setLocationFilter] = useUrlSelectState("location");

  const [editRow, setEditRow] = useState<RegrindItemRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<RegrindItemRow | null>(null);
  const [toggleRow, setToggleRow] = useState<RegrindItemRow | null>(null);

  const reset = () => {
    setSearch(null);
    setStatusFilter(null);
    setToolClassFilter(null);
    setLocationFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.code.includes(search) ||
      r.name.includes(search) ||
      (r.toolClass ?? "").includes(search) ||
      (r.location ?? "").includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    const matchesToolClass =
      !toolClassFilter || r.toolClass === toolClassFilter;
    const matchesLocation = !locationFilter || r.location === locationFilter;
    return (
      matchesSearch && matchesStatus && matchesToolClass && matchesLocation
    );
  });

  const bulkSetActive = (targets: RegrindItemRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setRegrindItemsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? tr("common.enabled2") : tr("common.disabled2"),
          message: isActive
            ? tr("master.regrindItems.bulkEnabled", { count: targets.length })
            : tr("master.regrindItems.bulkDisabled", {
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

  const bulkDelete = (targets: RegrindItemRow[]) => {
    openConfirm({
      title: tr("master.regrindItems.bulkDeleteRegrindItems"),
      message: tr("master.regrindItems.bulkDeleteConfirm", {
        count: targets.length,
      }),
      confirmLabel: tr("common.delete2"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteRegrindItems(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.regrindItems.bulkDeleted", {
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

  const priceText = (r: RegrindItemRow) =>
    r.standardUnitPrice == null ? (
      <Text c="dimmed" size="xs">
        {tr("master.regrindItems.priceListOnly")}
      </Text>
    ) : (
      <MoneyText value={r.standardUnitPrice} />
    );

  const columns: Column<RegrindItemRow>[] = [
    {
      key: "code",
      header: tr("common.code"),
      sortable: true,
      width: 160,
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
      key: "toolClass",
      header: tr("master.regrindItems.toolClass"),
      sortable: true,
      hideable: true,
      sortValue: (r) => r.toolClass ?? "",
      render: (r) => r.toolClass ?? "—",
    },
    {
      key: "location",
      header: tr("master.regrindItems.location"),
      sortable: true,
      width: 140,
      sortValue: (r) => r.location ?? "",
      render: (r) => r.location ?? "—",
    },
    {
      key: "flutes",
      header: tr("master.regrindItems.flutes"),
      sortable: true,
      hideable: true,
      align: "right",
      width: 80,
      sortValue: (r) => r.flutes ?? -1,
      render: (r) =>
        r.flutes == null ? (
          "—"
        ) : (
          <Text className="tabular-nums" size="sm">
            {r.flutes}
          </Text>
        ),
    },
    {
      key: "sizeBand",
      header: tr("master.regrindItems.sizeBand"),
      sortable: true,
      width: 160,
      // 並べたときに帯が細い順に並ぶよう上限で並べる（「φ6 超 10 以下」の 10）。
      sortValue: (r) => r.sizeMaxMm ?? Number.MAX_SAFE_INTEGER,
      render: (r) => r.sizeBand || "—",
    },
    {
      key: "standardUnitPrice",
      header: tr("master.regrindItems.standardPrice"),
      sortable: true,
      align: "right",
      width: 140,
      sortValue: (r) => r.standardUnitPrice ?? -1,
      render: priceText,
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

  const toOptions = (values: string[]) =>
    values.map((v) => ({ value: v, label: v }));

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[
        tr("common.masterData"),
        tr("master.regrindItems.pageTitle"),
      ]}
      filters={
        <>
          <Select
            aria-label={tr("master.regrindItems.toolClass")}
            clearable
            data={toOptions(toolClassOptions)}
            onChange={setToolClassFilter}
            placeholder={tr("master.regrindItems.toolClass")}
            searchable
            value={toolClassFilter}
            w={isMobile ? 140 : 200}
          />
          <Select
            aria-label={tr("master.regrindItems.location")}
            clearable
            data={toOptions(locationOptions)}
            onChange={setLocationFilter}
            placeholder={tr("master.regrindItems.location")}
            searchable
            value={locationFilter}
            w={isMobile ? 130 : 170}
          />
          <Select
            aria-label={tr("common.status")}
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder={tr("common.status")}
            value={statusFilter}
            w={isMobile ? 110 : 120}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          aria-label={tr("master.regrindItems.searchPlaceholder")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("master.regrindItems.searchPlaceholder")}
          value={search}
        />
      }
      title={tr("master.regrindItems.pageTitle")}
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
        defaultSort={{ key: "code", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconTool size={24} />}
        emptyMessage={tr("master.regrindItems.empty")}
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
                <Text c="dimmed" size="xs" truncate>
                  {[r.toolClass, r.location, r.sizeBand]
                    .filter(Boolean)
                    .join(" / ")}
                </Text>
                <Text size="xs">{priceText(r)}</Text>
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

      <EditRegrindItemModal
        onClose={() => setEditRow(null)}
        onDone={() => router.refresh()}
        opened={!!editRow}
        target={editRow}
      />
      <DeleteRegrindItemModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleRegrindItemActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
