"use client";

/**
 * DeliveryOrderTable — 出荷書 一覧 (SH01, design.md §8.1 / §14).
 *
 * Columns: 出荷書番号 / 注文明細番号 / 種別 / 数量合計 / 状態 / 出荷日。
 * フィルタ: 検索（番号・顧客・製品）+ 種別 + 状態。行クリック → 詳細。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch, IconTruck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  deliveryOrderTypeLabel,
  deliveryOrderTypeOptions,
} from "@/lib/enum-labels";
import type { DeliveryOrder } from "./model";

const BASE_PATH = "/shipping/delivery-orders";

/** 種別バッジ — DISPATCH=発送（青）/ STOCK_STORAGE=在庫保管（灰）。 */
export function DeliveryOrderTypeBadge({ type }: { type: string }) {
  const locale = useLocale();
  return (
    <Badge color={type === "DISPATCH" ? "blue" : "gray"} variant="light">
      {deliveryOrderTypeLabel(type, locale) ?? type}
    </Badge>
  );
}

export function DeliveryOrderTable({ rows }: { rows: DeliveryOrder[] }) {
  const tr = useTr();
  const locale = useLocale();
  const fmt = useFormat();
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
      o.deliveryOrderNumber.includes(search) ||
      o.orderLineNumbers.some((n) => n.includes(search)) ||
      o.customerName.includes(search);
    const matchesType = !type || o.type === type;
    const matchesStatus = !status || o.status === status;
    return matchesSearch && matchesType && matchesStatus;
  });

  const columns: Column<DeliveryOrder>[] = [
    {
      key: "deliveryOrderNumber",
      header: tr("出荷書番号"),
      sortable: true,
      render: (o) => (
        <Text ff="mono" size="sm">
          {o.deliveryOrderNumber}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: tr("顧客 / 注文明細"),
      sortable: true,
      render: (o) => (
        <>
          <Text size="sm">{o.customerName}</Text>
          <Text c="dimmed" ff="mono" size="xs">
            {o.orderLineNumbers.join(", ") || "—"}
          </Text>
        </>
      ),
    },
    {
      key: "type",
      header: tr("種別"),
      width: 110,
      sortValue: (o) => o.type,
      render: (o) => <DeliveryOrderTypeBadge type={o.type} />,
    },
    {
      key: "totalQuantity",
      header: tr("数量合計"),
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
      header: tr("状態"),
      width: 100,
      sortValue: (o) => o.status,
      render: (o) => <StatusBadge entity="DeliveryOrder" status={o.status} />,
    },
    {
      key: "shippedAt",
      header: tr("出荷日"),
      width: 120,
      sortValue: (o) => o.shippedAt ?? "",
      render: (o) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(o.shippedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("出荷"), tr("出荷書")]}
      filters={
        <>
          <Select
            clearable
            data={deliveryOrderTypeOptions(locale)}
            flex={isMobile ? 1 : undefined}
            onChange={setType}
            placeholder={tr("種別")}
            value={type}
            w={isMobile ? undefined : 140}
          />
          <Select
            clearable
            data={statusOptions("DeliveryOrder")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder={tr("状態")}
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
          placeholder={tr("出荷書番号・注文明細番号・顧客・製品で検索")}
          value={search}
        />
      }
      title={tr("出荷書")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "deliveryOrderNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconTruck size={24} />}
        emptyMessage={tr("出荷書がありません")}
        getRowId={(o) => o.id}
        onRowClick={(o) => router.push(`${BASE_PATH}/${o.id}`)}
        renderCard={(o) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {o.deliveryOrderNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {o.customerName}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {o.orderLineNumbers.join(", ") || "—"}
              </Text>
              <Group gap="md" mt={2}>
                <DeliveryOrderTypeBadge type={o.type} />
                <Text c="dimmed" size="xs">
                  {o.totalQuantity} 本
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="DeliveryOrder" status={o.status} />
              <Text c="dimmed" size="xs">
                {fmt.date(o.shippedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
