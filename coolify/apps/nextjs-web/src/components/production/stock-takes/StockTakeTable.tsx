"use client";

/**
 * StockTakeTable — 棚卸 一覧 (PD08, design.md §8.1 / §14)。
 *
 * Columns: 棚卸番号 / 拠点 / 保管場所 / 明細数 / 状態 / 承認状態 / 更新日。
 * フィルタ: 検索（棚卸番号・拠点・保管場所）+ 状態。行クリック → 詳細。
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconClipboardList, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { statusOptions } from "@/lib/status-map";
import type { StockTakeRow } from "./model";

const BASE_PATH = "/production/stock-takes";

export function StockTakeTable({ rows }: { rows: StockTakeRow[] }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setStatus(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.stockTakeNumber.includes(search) ||
      r.plantName.includes(search) ||
      (r.storageLocationName ?? "").includes(search);
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<StockTakeRow>[] = [
    {
      key: "stockTakeNumber",
      header: tr("production.stockTakes.table.number"),
      sortable: true,
      render: (r) => <DocNumber>{r.stockTakeNumber}</DocNumber>,
    },
    {
      key: "plantName",
      header: tr("common.site"),
      sortable: true,
      render: (r) => r.plantName,
    },
    {
      key: "storageLocationName",
      header: tr("production.stockTakes.table.storageLocation"),
      sortValue: (r) => r.storageLocationName ?? "",
      render: (r) => r.storageLocationName ?? "—",
    },
    {
      key: "lineCount",
      header: tr("production.stockTakes.table.lineCount"),
      align: "right",
      width: 90,
      sortValue: (r) => r.lineCount,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.lineCount}
        </Text>
      ),
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 110,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge entity="StockTake" status={r.status} />,
    },
    {
      key: "approvalStatus",
      header: tr("production.stockTakes.table.approvalStatus"),
      width: 130,
      sortValue: (r) => r.approvalStatus,
      render: (r) =>
        r.approvalStatus === "NONE" ? (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ) : (
          <StatusBadge entity="StockTakeApproval" status={r.approvalStatus} />
        ),
    },
    {
      key: "updatedAt",
      header: tr("common.updated"),
      width: 150,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {fmt.dateTime(r.updatedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("common.production"), tr("common.stockTake")]}
      filters={
        <Select
          aria-label={tr("common.status")}
          clearable
          data={statusOptions("StockTake")}
          onChange={setStatus}
          placeholder={tr("common.status")}
          value={status}
          w={150}
        />
      }
      onReset={reset}
      search={
        <TextInput
          aria-label={tr("production.stockTakes.table.searchPlaceholder")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("production.stockTakes.table.searchPlaceholder")}
          value={search}
        />
      }
      title={tr("common.stockTake")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "stockTakeNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconClipboardList size={24} />}
        emptyMessage={tr("production.stockTakes.table.emptyMessage")}
        getRowId={(r) => r.stockTakeNumber}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.stockTakeNumber}`)}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {r.stockTakeNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {r.plantName}
                {r.storageLocationName ? ` / ${r.storageLocationName}` : ""}
              </Text>
              <Group gap="md" mt={2}>
                <Text c="dimmed" size="xs">
                  {tr("common.lineItemsWithCount", { count: r.lineCount })}
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="StockTake" status={r.status} />
              <Text c="dimmed" size="xs">
                {fmt.date(r.updatedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
