"use client";

/**
 * PurchaseOrderTable — 素材発注書 一覧 (PU03, design.md §8.1 / §14)。
 *
 * Columns: 発注番号 / 仕入先 / 明細数 / 合計金額 / 状態 / 発注日。
 * フィルタ: 検索（発注番号・仕入先）+ 状態。行クリック → 詳細。
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch, IconShoppingCart } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate } from "@/lib/format";
import type { PurchaseOrderRow } from "./model";

const BASE_PATH = "/purchase/purchase-orders";

export function PurchaseOrderTable({ rows }: { rows: PurchaseOrderRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setStatus(null);
  };

  const filtered = rows.filter((o) => {
    const matchesSearch =
      !search || o.poNumber.includes(search) || o.supplierName.includes(search);
    const matchesStatus = !status || o.status === status;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<PurchaseOrderRow>[] = [
    {
      key: "poNumber",
      header: "発注番号",
      sortable: true,
      render: (o) => (
        <Text ff="mono" size="sm">
          {o.poNumber}
        </Text>
      ),
    },
    {
      key: "supplierName",
      header: "仕入先",
      sortable: true,
      render: (o) => o.supplierName,
    },
    {
      key: "itemCount",
      header: "明細数",
      align: "right",
      width: 90,
      sortValue: (o) => o.itemCount,
      render: (o) => (
        <Text className="tabular-nums" size="sm">
          {o.itemCount}
        </Text>
      ),
    },
    {
      key: "totalAmount",
      header: "合計金額",
      align: "right",
      width: 130,
      sortValue: (o) => o.totalAmount,
      render: (o) => <MoneyText value={o.totalAmount} />,
    },
    {
      key: "status",
      header: "状態",
      width: 110,
      sortValue: (o) => o.status,
      render: (o) => (
        <StatusBadge entity="MaterialPurchaseOrder" status={o.status} />
      ),
    },
    {
      key: "purchaseDate",
      header: "発注日",
      width: 120,
      sortValue: (o) => o.purchaseDate ?? "",
      render: (o) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(o.purchaseDate)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["購買", "素材発注書"]}
      filters={
        <Select
          clearable
          data={statusOptions("MaterialPurchaseOrder")}
          flex={isMobile ? 1 : undefined}
          onChange={setStatus}
          placeholder="状態"
          value={status}
          w={isMobile ? undefined : 150}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="発注番号・仕入先で検索"
          value={search}
        />
      }
      title="素材発注書"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "poNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconShoppingCart size={24} />}
        emptyMessage="素材発注書がありません"
        getRowId={(o) => o.poNumber}
        onRowClick={(o) => router.push(`${BASE_PATH}/${o.poNumber}`)}
        renderCard={(o) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {o.poNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {o.supplierName}
              </Text>
              <Group gap="md" mt={2}>
                <Text c="dimmed" size="xs">
                  明細 {o.itemCount} 件
                </Text>
                <Text fw={500} size="xs">
                  <MoneyText value={o.totalAmount} />
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="MaterialPurchaseOrder" status={o.status} />
              <Text c="dimmed" size="xs">
                {formatDate(o.purchaseDate)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
