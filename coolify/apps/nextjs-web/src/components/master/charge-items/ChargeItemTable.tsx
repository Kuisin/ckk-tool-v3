"use client";

/**
 * ChargeItemTable.tsx — 料金マスタ 一覧 (MS0G, design.md §8.1 / §14).
 *
 * 列: コード / 名称 / 金額の決まり方 / 金額 / 税区分 / 表示順 / 状態。
 * 詳細ページを持たない小マスタなので、行クリックと「編集」はモーダルで完結する。
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
  IconCoin,
  IconEdit,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteChargeItems,
  setChargeItemsActive,
} from "@/app/(dashboard)/master/charge-items/actions";
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
  type ChargeItemModalTarget,
  DeleteChargeItemModal,
  EditChargeItemModal,
  ToggleChargeItemActiveModal,
} from "./ChargeItemModals";

const BASE_PATH = "/master/charge-items";

export interface ChargeItemRow extends ChargeItemModalTarget {
  /** 表示名（現ロケール解決済み）。 */
  name: string;
  /** 税区分の表示名（null = 既定に従う）。 */
  taxCategoryName: string | null;
}

export function ChargeItemTable({
  rows,
  taxCategoryOptions,
}: {
  rows: ChargeItemRow[];
  taxCategoryOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const STATUS_OPTIONS = [
    { value: "active", label: tr("common.enabled") },
    { value: "inactive", label: tr("common.disabled") },
  ];
  const MODE_OPTIONS = [
    { value: "FIXED", label: tr("master.chargeItems.modeFixed") },
    { value: "VARIABLE", label: tr("master.chargeItems.modeVariable") },
  ];

  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");
  const [modeFilter, setModeFilter] = useUrlSelectState("mode");

  const [editRow, setEditRow] = useState<ChargeItemRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<ChargeItemRow | null>(null);
  const [toggleRow, setToggleRow] = useState<ChargeItemRow | null>(null);

  const reset = () => {
    setSearch(null);
    setStatusFilter(null);
    setModeFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search || r.code.includes(search) || r.name.includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    const matchesMode = !modeFilter || r.amountMode === modeFilter;
    return matchesSearch && matchesStatus && matchesMode;
  });

  const bulkSetActive = (targets: ChargeItemRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setChargeItemsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? tr("common.enabled2") : tr("common.disabled2"),
          message: isActive
            ? tr("master.chargeItems.bulkEnabled", { count: targets.length })
            : tr("master.chargeItems.bulkDisabled", { count: targets.length }),
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

  const bulkDelete = (targets: ChargeItemRow[]) => {
    openConfirm({
      title: tr("master.chargeItems.bulkDeleteChargeItems"),
      message: tr("master.chargeItems.bulkDeleteConfirm", {
        count: targets.length,
      }),
      confirmLabel: tr("common.delete2"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteChargeItems(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.chargeItems.bulkDeleted", {
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

  const modeBadge = (r: ChargeItemRow) => (
    <Badge color={r.amountMode === "FIXED" ? "blue" : "gray"} variant="light">
      {r.amountMode === "FIXED"
        ? tr("master.chargeItems.modeFixed")
        : tr("master.chargeItems.modeVariable")}
    </Badge>
  );

  const amountText = (r: ChargeItemRow) =>
    r.defaultAmount == null ? (
      "—"
    ) : (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        <MoneyText value={r.defaultAmount} />
        {r.amountMode === "VARIABLE" && (
          <Text c="dimmed" size="xs">
            {tr("master.chargeItems.defaultSuffix")}
          </Text>
        )}
      </Group>
    );

  const columns: Column<ChargeItemRow>[] = [
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
      key: "amountMode",
      header: tr("master.chargeItems.amountMode"),
      sortable: true,
      width: 120,
      sortValue: (r) => r.amountMode,
      render: modeBadge,
    },
    {
      key: "defaultAmount",
      header: tr("master.chargeItems.amount"),
      sortable: true,
      align: "right",
      width: 140,
      sortValue: (r) => r.defaultAmount ?? -1,
      render: amountText,
    },
    {
      key: "taxCategory",
      header: tr("master.taxCategories.title"),
      hideable: true,
      width: 120,
      render: (r) => r.taxCategoryName ?? tr("master.taxCategories.useDefault"),
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
      breadcrumbs={[
        tr("common.masterData"),
        tr("master.chargeItems.pageTitle"),
      ]}
      filters={
        <>
          <Select
            aria-label={tr("master.chargeItems.amountMode")}
            clearable
            data={MODE_OPTIONS}
            onChange={setModeFilter}
            placeholder={tr("master.chargeItems.amountMode")}
            value={modeFilter}
            w={isMobile ? 130 : 150}
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
          aria-label={tr("common.searchByCodeOrName")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("common.searchByCodeOrName")}
          value={search}
        />
      }
      title={tr("master.chargeItems.pageTitle")}
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
        emptyIcon={<IconCoin size={24} />}
        emptyMessage={tr("master.chargeItems.empty")}
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
                <Group gap="xs">
                  {modeBadge(r)}
                  <Text size="xs">{amountText(r)}</Text>
                </Group>
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

      <EditChargeItemModal
        onClose={() => setEditRow(null)}
        onDone={() => router.refresh()}
        opened={!!editRow}
        target={editRow}
        taxCategoryOptions={taxCategoryOptions}
      />
      <DeleteChargeItemModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleChargeItemActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
