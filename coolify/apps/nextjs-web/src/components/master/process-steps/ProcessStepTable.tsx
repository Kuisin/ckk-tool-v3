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
import { useLocale } from "next-intl";
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
import { useTr } from "@/hooks/useTr";
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
  quantityTracking: string;
  /** 実行時のロット入力の既定（REQUIRED/OPTIONAL/NONE）。 */
  lotInputMode: string;
  sortOrder: number;
  isActive: boolean;
}

/** 数量管理モードの短縮ラベル（一覧列用）。 */
const QUANTITY_TRACKING_SHORT: Record<string, string> = {
  FLOW: "数量",
  INSPECTION: "検査",
};

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

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
  const tr = useTr();
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
          title: isActive ? "有効化しました" : tr("無効化しました"),
          message: `${targets.length}件の工程を${isActive ? "有効化" : "無効化"}しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const bulkDelete = (targets: ProcessStepRow[]) => {
    openConfirm({
      title: tr("工程の一括削除"),
      message: `選択中の${targets.length}件の工程を削除します。他の工程が依存している工程は削除できません。この操作は取り消せません。`,
      confirmLabel: tr("削除する"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteProcessSteps(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: `${targets.length}件の工程を削除しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: tr("エラー"),
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
      header: "コード",
      sortable: true,
      width: 220,
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
      key: "category",
      header: tr("カテゴリ"),
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
      header: tr("実施場所"),
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
      header: tr("同期可"),
      sortable: true,
      hideable: true,
      width: 80,
      sortValue: (r) => (r.isSyncCapable ? 1 : 0),
      render: (r) => (
        <FlagBadge color="cyan" label={tr("同期可")} on={r.isSyncCapable} />
      ),
    },
    {
      key: "isInspection",
      header: tr("検査"),
      sortable: true,
      hideable: true,
      width: 80,
      sortValue: (r) => (r.isInspection ? 1 : 0),
      render: (r) => (
        <FlagBadge color="blue" label={tr("検査")} on={r.isInspection} />
      ),
    },
    {
      key: "isApprovalStep",
      header: "承認",
      sortable: true,
      hideable: true,
      width: 80,
      sortValue: (r) => (r.isApprovalStep ? 1 : 0),
      render: (r) => (
        <FlagBadge color="green" label="承認" on={r.isApprovalStep} />
      ),
    },
    {
      key: "quantityTracking",
      header: tr("数量管理"),
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
      header: tr("表示順"),
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
      header: tr("状態"),
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("マスタ"), tr("工程マスタ")]}
      filters={
        <>
          <Select
            clearable
            data={processCategoryOptions(locale)}
            onChange={setCategoryFilter}
            placeholder={tr("カテゴリ")}
            value={categoryFilter}
            w={isMobile ? 130 : 150}
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
          placeholder={tr("コード・名称で検索")}
          value={search}
        />
      }
      title={tr("工程マスタ")}
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
        defaultSort={{ key: "sortOrder", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconGitBranch size={24} />}
        emptyMessage={tr("工程がありません")}
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
                      {tr("同期可")}
                    </Badge>
                  )}
                  {r.isInspection && (
                    <Badge color="blue" size="xs" variant="light">
                      {tr("検査")}
                    </Badge>
                  )}
                  {r.isApprovalStep && (
                    <Badge color="green" size="xs" variant="light">
                      承認
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
