"use client";

/**
 * SalesOrderTable — 注文請書 一覧 (PD01, design.md §8.1 / §14).
 *
 * Columns: 注文請書番号 / 顧客 / 製品 / 数量 / 金額 / 納期 / 状態。
 * フィルタ: 検索（番号・顧客・製品）+ 状態 + 注文種別。行クリック → 詳細。
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconClipboardList, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { ORDER_TYPE_LABEL, ORDER_TYPE_OPTIONS } from "@/lib/enum-labels";
import { formatDate } from "@/lib/format";
import type { SalesOrder } from "./model";

const BASE_PATH = "/production/sales-orders";

export function SalesOrderTable({ rows }: { rows: SalesOrder[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");
  const [orderType, setOrderType] = useUrlSelectState("orderType");

  const reset = () => {
    setSearch(null);
    setStatus(null);
    setOrderType(null);
  };

  const filtered = rows.filter((o) => {
    const matchesSearch =
      !search ||
      o.orderNumber.includes(search) ||
      o.customerName.includes(search) ||
      o.productName.includes(search);
    const matchesStatus = !status || o.status === status;
    const matchesType = !orderType || o.orderType === orderType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const columns: Column<SalesOrder>[] = [
    {
      key: "orderNumber",
      header: "注文請書番号",
      sortable: true,
      render: (o) => (
        <Text ff="mono" size="sm">
          {o.orderNumber}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: "顧客",
      sortable: true,
      render: (o) => o.customerName,
    },
    {
      key: "productName",
      header: "製品",
      sortable: true,
      render: (o) => (
        <>
          <Text size="sm">{o.productName}</Text>
          <Text c="dimmed" size="xs">
            {ORDER_TYPE_LABEL[o.orderType] ?? o.orderType}
          </Text>
        </>
      ),
    },
    {
      key: "quantity",
      header: "数量",
      align: "right",
      width: 90,
      sortValue: (o) => o.quantity,
      render: (o) => (
        <Text className="tabular-nums" size="sm">
          {o.quantity}
        </Text>
      ),
    },
    {
      key: "amount",
      header: "金額",
      align: "right",
      width: 130,
      sortValue: (o) => o.amount,
      render: (o) => <MoneyText value={o.amount} />,
    },
    {
      key: "deliveryDate",
      header: "納期",
      width: 120,
      sortValue: (o) => o.deliveryDate ?? "",
      render: (o) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(o.deliveryDate)}
        </Text>
      ),
    },
    {
      key: "status",
      header: "状態",
      width: 100,
      sortValue: (o) => o.status,
      render: (o) => <StatusBadge entity="SalesOrder" status={o.status} />,
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["販売", "注文請書"]}
      filters={
        <>
          <Select
            clearable
            data={statusOptions("SalesOrder")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder="状態"
            value={status}
            w={isMobile ? undefined : 140}
          />
          <Select
            clearable
            data={ORDER_TYPE_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setOrderType}
            placeholder="注文種別"
            value={orderType}
            w={isMobile ? undefined : 140}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="注文請書番号・顧客・製品で検索"
          value={search}
        />
      }
      title="注文請書"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "orderNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconClipboardList size={24} />}
        emptyMessage="注文請書がありません"
        getRowId={(o) => o.id}
        onRowClick={(o) => router.push(`${BASE_PATH}/${o.id}`)}
        renderCard={(o) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {o.orderNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {o.customerName}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {o.productName}
              </Text>
              <Group gap="md" mt={2}>
                <Text c="dimmed" size="xs">
                  {o.quantity} 本
                </Text>
                <Text fw={500} size="xs">
                  <MoneyText value={o.amount} />
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="SalesOrder" status={o.status} />
              <Text c="dimmed" size="xs">
                {formatDate(o.deliveryDate)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
