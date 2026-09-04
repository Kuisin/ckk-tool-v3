"use client";

/**
 * ProcessStepTable.tsx — 工程マスタ 一覧 (MS08, design.md §8.1 / §13.3 / §14).
 *
 * 列: コード / 名称 / カテゴリ / 実施場所 / 同期可 / 検査 / 承認 / 状態。
 * 既定ソートは sort_order（カタログの参考順）。
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
  IconGitBranch,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteProcessSteps,
  setProcessStepsActive,
} from "@/app/(dashboard)/master/process-steps/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  processCategoryLabel,
  processCategoryOptions,
  processExecutionLabel,
} from "@/lib/enum-labels";
import {
  DeleteProcessStepModal,
  type ProcessStepModalTarget,
  ToggleProcessStepActiveModal,
} from "./ProcessStepModals";

const BASE_PATH = "/master/process-steps";

/** カテゴリ → Badge 色（design-preview の工程カタログ配色）。 */
export const PROCESS_CATEGORY_COLOR: Record<string, string> = {
  MATERIAL_PREP: "teal",
  MACHINING: "violet",
  COATING: "orange",
  INSPECTION: "blue",
  APPROVAL: "green",
  SHIPPING: "gray",
};

export interface ProcessStepRow {
  id: number;
  code: string;
  name: string;
  category: string;
  executionLocation: string;
  isSyncCapable: boolean;
  isInspection: boolean;
  isApprovalStep: boolean;
  isFinalInspection: boolean;
  quantityTracking: string;
  /** 実行時のロット入力の既定（REQUIRED/OPTIONAL/NONE）。 */
  lotInputMode: string;
  sortOrder: number;
  isActive: boolean;
}

/** boolean フラグ列: 真なら小さな light Badge、偽は "—"。 */
function FlagBadge({
  on,
  color,
  label,
}: {
  on: boolean;
  color: string;
  label: string;
}) {
  return on ? (
    <Badge color={color} size="xs" variant="light">
      {label}
    </Badge>
  ) : (
    <Text c="dimmed" size="sm">
      —
    </Text>
  );
}

export function ProcessStepTable({ rows }: { rows: ProcessStepRow[] }) {
  const tr = useTranslations();
  const STATUS_OPTIONS = [
    { value: "active", label: tr("common.enabled") },
    { value: "inactive", label: tr("common.disabled") },
  ];
  /** 数量管理モードの短縮ラベル（一覧列用）。 */
  const QUANTITY_TRACKING_SHORT: Record<string, string> = {
    FLOW: tr("common.quantity"),
    INSPECTION: tr("common.inspection"),
  };
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [categoryFilter, setCategoryFilter] = useUrlSelectState("category");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");

  const [deleteRow, setDeleteRow] = useState<ProcessStepModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<ProcessStepModalTarget | null>(
    null,
  );

  const reset = () => {
    setSearch(null);
    setCategoryFilter(null);
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.code.toLowerCase().includes(search.toLowerCase()) ||
      r.name.includes(search);
    const matchesCategory = !categoryFilter || r.category === categoryFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const bulkSetActive = (targets: ProcessStepRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setProcessStepsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? tr("common.enabled2") : tr("common.disabled2"),
          message: isActive
            ? tr("master.processStepTable.bulkEnabledMessage", {
                count: targets.length,
              })
            : tr("master.processStepTable.bulkDisabledMessage", {
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

  const bulkDelete = (targets: ProcessStepRow[]) => {
    openConfirm({
      title: tr("master.processSteps.bulkDeleteSteps"),
      message: tr("master.processStepTable.bulkDeleteConfirmMessage", {
        count: targets.length,
      }),
      confirmLabel: tr("common.delete2"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteProcessSteps(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.processStepTable.bulkDeletedMessage", {
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

  const columns: Column<ProcessStepRow>[] = [
    {
      key: "code",
      header: tr("common.code"),
      sortable: true,
      width: 220,
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
      key: "category",
      header: tr("common.category"),
      sortable: true,
      width: 130,
      sortValue: (r) => processCategoryLabel(r.category, locale) ?? r.category,
      render: (r) => (
        <Badge
          color={PROCESS_CATEGORY_COLOR[r.category] ?? "gray"}
          variant="light"
        >
          {processCategoryLabel(r.category, locale) ?? r.category}
        </Badge>
      ),
    },
    {
      key: "executionLocation",
      header: tr("common.executionLocation"),
      sortable: true,
      hideable: true,
      width: 110,
      sortValue: (r) => r.executionLocation,
      render: (r) => (
        <Text size="sm">
          {processExecutionLabel(r.executionLocation, locale) ??
            r.executionLocation}
        </Text>
      ),
    },
    {
      key: "isSyncCapable",
      header: tr("common.syncCapable"),
      sortable: true,
      hideable: true,
      width: 80,
      sortValue: (r) => (r.isSyncCapable ? 1 : 0),
      render: (r) => (
        <FlagBadge
          color="cyan"
          label={tr("common.syncCapable")}
          on={r.isSyncCapable}
        />
      ),
    },
    {
      key: "isInspection",
      header: tr("common.inspection"),
      sortable: true,
      hideable: true,
      width: 80,
      sortValue: (r) => (r.isInspection ? 1 : 0),
      render: (r) => (
        <FlagBadge
          color="blue"
          label={tr("common.inspection")}
          on={r.isInspection}
        />
      ),
    },
    {
      key: "isApprovalStep",
      header: tr("common.approve"),
      sortable: true,
      hideable: true,
      width: 80,
      sortValue: (r) => (r.isApprovalStep ? 1 : 0),
      render: (r) => (
        <FlagBadge
          color="green"
          label={tr("common.approve")}
          on={r.isApprovalStep}
        />
      ),
    },
    {
      key: "isFinalInspection",
      header: tr("common.finalInspection"),
      sortable: true,
      hideable: true,
      width: 96,
      sortValue: (r) => (r.isFinalInspection ? 1 : 0),
      render: (r) => (
        <FlagBadge
          color="orange"
          label={tr("common.finalInspection")}
          on={r.isFinalInspection}
        />
      ),
    },
    {
      key: "quantityTracking",
      header: tr("common.quantityTracking"),
      sortable: true,
      hideable: true,
      width: 100,
      sortValue: (r) => r.quantityTracking,
      render: (r) =>
        r.quantityTracking === "NONE" ? (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ) : (
          <Badge
            color={r.quantityTracking === "INSPECTION" ? "blue" : "violet"}
            size="xs"
            variant="light"
          >
            {QUANTITY_TRACKING_SHORT[r.quantityTracking] ?? r.quantityTracking}
          </Badge>
        ),
    },
    {
      key: "sortOrder",
      header: tr("common.sortOrder"),
      sortable: true,
      hideable: true,
      width: 90,
      align: "right",
      sortValue: (r) => r.sortOrder,
      render: (r) => (
        <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
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
      breadcrumbs={[tr("common.masterData"), tr("common.processSteps")]}
      filters={
        <>
          <Select
            clearable
            data={processCategoryOptions(locale)}
            onChange={setCategoryFilter}
            placeholder={tr("common.category")}
            value={categoryFilter}
            w={isMobile ? 130 : 150}
          />
          <Select
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
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("common.searchByCodeOrName")}
          value={search}
        />
      }
      title={tr("common.processSteps")}
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
        emptyIcon={<IconGitBranch size={24} />}
        emptyMessage={tr("common.thereAreNoSteps")}
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        pageSize={50}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.code}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Group gap={6} mt={2}>
                  <Badge
                    color={PROCESS_CATEGORY_COLOR[r.category] ?? "gray"}
                    size="xs"
                    variant="light"
                  >
                    {processCategoryLabel(r.category, locale) ?? r.category}
                  </Badge>
                  <Text c="dimmed" size="xs">
                    {processExecutionLabel(r.executionLocation, locale) ??
                      r.executionLocation}
                  </Text>
                  {r.isSyncCapable && (
                    <Badge color="cyan" size="xs" variant="light">
                      {tr("common.syncCapable")}
                    </Badge>
                  )}
                  {r.isInspection && (
                    <Badge color="blue" size="xs" variant="light">
                      {tr("common.inspection")}
                    </Badge>
                  )}
                  {r.isApprovalStep && (
                    <Badge color="green" size="xs" variant="light">
                      {tr("common.approve")}
                    </Badge>
                  )}
                  {r.isFinalInspection && (
                    <Badge color="orange" size="xs" variant="light">
                      {tr("common.finalInspection")}
                    </Badge>
                  )}
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
            onAction: (r) => router.push(`${BASE_PATH}/${r.id}/edit`),
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

      <DeleteProcessStepModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleProcessStepActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
