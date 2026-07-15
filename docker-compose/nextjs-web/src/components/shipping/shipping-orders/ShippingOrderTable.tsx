"use client";

/**
 * ShippingOrderTable — 出荷書 一覧 (SH01, design.md §8.1 / §14).
 *
 * Columns: 出荷書番号 / 注文請書番号 / 種別 / 数量合計 / 状態 / 出荷日。
 * フィルタ: 検索（番号・顧客・製品）+ 種別 + 状態。行クリック → 詳細。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch, IconTruck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { SHIPPING_TYPE_LABEL, SHIPPING_TYPE_OPTIONS } from "@/lib/enum-labels";
import { formatDate } from "@/lib/format";
import type { ShippingOrder } from "./model";

const BASE_PATH = "/shipping/shipping-orders";

/** 種別バッジ — DISPATCH=発送（青）/ STOCK_STORAGE=在庫保管（灰）。 */
export function ShippingTypeBadge({ type }: { type: string }) {
  return (
    <Badge color={type === "DISPATCH" ? "blue" : "gray"} variant="light">
      {SHIPPING_TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

export function ShippingOrderTable({ rows }: { rows: ShippingOrder[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [type, setType] = useUrlSelectState("type");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setType(null);
    setStatus(null);
  };

  const filtered = rows.filter((o) => {
    const matchesSearch =
      !search ||
      o.shippingNumber.includes(search) ||
      o.salesOrderNumber.includes(search) ||
      o.customerName.includes(search) ||
      o.productName.includes(search);
    const matchesType = !type || o.type === type;
    const matchesStatus = !status || o.status === status;
    return matchesSearch && matchesType && matchesStatus;
  });

  const columns: Column<ShippingOrder>[] = [
    {
      key: "shippingNumber",
      header: "出荷書番号",
      sortable: true,
      render: (o) => (
        <Text ff="mono" size="sm">
          {o.shippingNumber}
        </Text>
      ),
    },
    {
      key: "salesOrderNumber",
      header: "注文請書番号",
      sortable: true,
      render: (o) => (
        <>
          <Text ff="mono" size="sm">
            {o.salesOrderNumber}
          </Text>
          <Text c="dimmed" size="xs">
            {o.customerName}
          </Text>
        </>
      ),
    },
    {
      key: "type",
      header: "種別",
      width: 110,
      sortValue: (o) => o.type,
      render: (o) => <ShippingTypeBadge type={o.type} />,
    },
    {
      key: "totalQuantity",
      header: "数量合計",
      align: "right",
      width: 100,
      sortValue: (o) => o.totalQuantity,
      render: (o) => (
        <Text className="tabular-nums" size="sm">
          {o.totalQuantity}
        </Text>
      ),
    },
    {
      key: "status",
      header: "状態",
      width: 100,
      sortValue: (o) => o.status,
      render: (o) => <StatusBadge entity="ShippingOrder" status={o.status} />,
    },
    {
      key: "shippedAt",
      header: "出荷日",
      width: 120,
      sortValue: (o) => o.shippedAt ?? "",
      render: (o) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(o.shippedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["出荷", "出荷書"]}
      filters={
        <>
          <Select
            clearable
            data={SHIPPING_TYPE_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setType}
            placeholder="種別"
            value={type}
            w={isMobile ? undefined : 140}
          />
          <Select
            clearable
            data={statusOptions("ShippingOrder")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder="状態"
            value={status}
            w={isMobile ? undefined : 140}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="出荷書番号・注文請書番号・顧客・製品で検索"
          value={search}
        />
      }
      title="出荷書"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "shippingNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconTruck size={24} />}
        emptyMessage="出荷書がありません"
        getRowId={(o) => o.id}
        onRowClick={(o) => router.push(`${BASE_PATH}/${o.id}`)}
        renderCard={(o) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {o.shippingNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {o.customerName}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {o.salesOrderNumber} · {o.productName}
              </Text>
              <Group gap="md" mt={2}>
                <ShippingTypeBadge type={o.type} />
                <Text c="dimmed" size="xs">
                  {o.totalQuantity} 本
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="ShippingOrder" status={o.status} />
              <Text c="dimmed" size="xs">
                {formatDate(o.shippedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
