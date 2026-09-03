"use client";

/**
 * OrderLineTable — 注文明細 一覧 (PD01, design.md §8.1 / §14).
 *
 * Columns: 注文明細番号 / 顧客 / 製品 / 数量 / 金額 / 納期 / 状態。
 * フィルタ: 検索（番号・顧客・製品）+ 状態 + 注文種別。行クリック → 詳細。
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import {
  IconClipboardCheck,
  IconClipboardList,
  IconSearch,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { orderTypeLabel, orderTypeOptions } from "@/lib/enum-labels";
import { statusOptions } from "@/lib/status-map";
import type { OrderLine } from "./model";

const BASE_PATH = "/sales/order-lines";

export function OrderLineTable({ rows }: { rows: OrderLine[] }) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
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

  const columns: Column<OrderLine>[] = [
    {
      key: "orderNumber",
      header: tr("common.orderLineNumber"),
      sortable: true,
      render: (o) => (
        <Text ff="mono" size="sm">
          {o.orderNumber}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: tr("common.customer"),
      sortable: true,
      render: (o) => o.customerName,
    },
    {
      key: "productName",
      header: tr("common.product"),
      sortable: true,
      render: (o) => (
        <>
          <Text size="sm">{o.productName}</Text>
          <Text c="dimmed" size="xs">
            {orderTypeLabel(o.orderType, locale) ?? o.orderType}
          </Text>
        </>
      ),
    },
    {
      key: "quantity",
      header: tr("common.quantity"),
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
      header: tr("common.amount"),
      align: "right",
      width: 130,
      sortValue: (o) => o.amount ?? 0,
      render: (o) => <MoneyText value={o.amount} />,
    },
    {
      key: "deliveryDate",
      header: tr("common.deliveryDate"),
      width: 120,
      sortValue: (o) => o.deliveryDate ?? "",
      render: (o) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(o.deliveryDate)}
        </Text>
      ),
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 100,
      sortValue: (o) => o.status,
      render: (o) => <StatusBadge entity="OrderLine" status={o.status} />,
    },
  ];

  return (
    <ListShell
      // 注文明細は作成・編集を持たない（注文請書の明細エディタが唯一の入口）。
      // 新規ボタンの代わりに親側の一覧へ渡す — 注文請書側にも対の導線がある。
      action={
        <SecondaryButton
          href="/sales/order-acceptances"
          leftSection={<IconClipboardCheck size={14} />}
        >
          {tr("sales.orderLines.orderAcceptances")}
        </SecondaryButton>
      }
      breadcrumbs={[tr("common.sales"), tr("common.orderLine")]}
      filters={
        <>
          <Select
            clearable
            data={statusOptions("OrderLine")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder={tr("common.status")}
            value={status}
            w={isMobile ? undefined : 140}
          />
          <Select
            clearable
            data={orderTypeOptions(locale)}
            flex={isMobile ? 1 : undefined}
            onChange={setOrderType}
            placeholder={tr("common.orderType")}
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
          placeholder={tr("common.searchByOrderLineNumberCustomer")}
          value={search}
        />
      }
      title={tr("common.orderLine")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "orderNumber", dir: "desc" }}
        emptyAction={
          <SecondaryButton
            href="/sales/order-acceptances"
            leftSection={<IconClipboardCheck size={14} />}
          >
            {tr("sales.orderLines.orderAcceptances")}
          </SecondaryButton>
        }
        emptyIcon={<IconClipboardList size={24} />}
        emptyMessage={tr("sales.orderLines.thereAreNoOrderLinesThey")}
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
                  {tr("common.quantityPcs", { quantity: o.quantity })}
                </Text>
                <Text fw={500} size="xs">
                  <MoneyText value={o.amount} />
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="OrderLine" status={o.status} />
              <Text c="dimmed" size="xs">
                {fmt.date(o.deliveryDate)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
