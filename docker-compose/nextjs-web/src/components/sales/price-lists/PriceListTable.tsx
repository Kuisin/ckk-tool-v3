"use client";

/**
 * PriceListTable — 価格表 一覧 (design.md §8.1 / §14).
 *
 * One row per (顧客, 製品, 注文種別) entry — 本番・テスト など注文種別ごとに行を
 * 分ける。Row click → the entry's detail page. Replace MOCK_PRICE_ENTRIES with
 * server data + URL-param filters later.
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
import {
  IconCopy,
  IconCurrencyYen,
  IconSearch,
  IconToggleRight,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  CUSTOMERS,
  ORDER_TYPE_LABEL,
  ORDER_TYPE_OPTIONS,
  PRODUCTS,
} from "@/lib/mock";
import { DeletePriceListModal } from "./DeletePriceListModal";
import { DuplicatePriceListModal } from "./DuplicatePriceListModal";
import {
  entrySummary,
  MOCK_PRICE_ENTRIES,
  type PriceListEntry,
  priceRangeLabel,
  validPeriod,
} from "./mock";

const BASE_PATH = "/sales/price-lists";

export function PriceListTable() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<string | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<string | null>(null);

  // Modal targets (null = closed).
  const [deleteTarget, setDeleteTarget] = useState<PriceListEntry | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<PriceListEntry | null>(
    null,
  );

  const reset = () => {
    setSearch("");
    setCustomer(null);
    setProduct(null);
    setOrderType(null);
  };

  const filtered = MOCK_PRICE_ENTRIES.filter((e) => {
    const matchesSearch =
      !search ||
      e.customerName.includes(search) ||
      e.productName.includes(search);
    const matchesCustomer = !customer || e.customerName === customer;
    const matchesProduct = !product || e.productId === product;
    const matchesType = !orderType || e.orderType === orderType;
    return matchesSearch && matchesCustomer && matchesProduct && matchesType;
  });

  const columns: Column<PriceListEntry>[] = [
    {
      key: "customerName",
      header: "顧客",
      sortable: true,
      render: (e) => e.customerName,
    },
    {
      key: "productName",
      header: "製品",
      sortable: true,
      render: (e) => e.productName,
    },
    {
      key: "orderType",
      header: "注文種別",
      sortable: true,
      width: 120,
      render: (e) => (
        <Badge color="gray" variant="light">
          {ORDER_TYPE_LABEL[e.orderType]}
        </Badge>
      ),
    },
    {
      key: "tiers",
      header: "段階",
      width: 80,
      sortValue: (e) => entrySummary(e).tierCount,
      render: (e) => `${entrySummary(e).tierCount}段階`,
    },
    {
      key: "price",
      header: "単価",
      align: "right",
      width: 160,
      sortValue: (e) => entrySummary(e).minPrice,
      render: (e) => {
        const s = entrySummary(e);
        return (
          <Text className="tabular-nums" ff="mono" size="sm" ta="right">
            {priceRangeLabel(s.minPrice, s.maxPrice)}
          </Text>
        );
      },
    },
    {
      key: "validPeriod",
      header: "有効期間",
      hideable: true,
      width: 200,
      sortValue: (e) => e.validFrom,
      render: (e) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {validPeriod(e.validFrom, e.validUntil)}
        </Text>
      ),
    },
    {
      key: "isActive",
      header: "状態",
      width: 90,
      sortValue: (e) => (e.isActive ? 1 : 0),
      render: (e) => <ActiveBadge active={e.isActive} />,
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["販売", "価格表"]}
      filters={
        <>
          <Select
            clearable
            data={CUSTOMERS.map((c) => ({ value: c.label, label: c.label }))}
            flex={isMobile ? 1 : undefined}
            onChange={setCustomer}
            placeholder="顧客"
            searchable
            value={customer}
            w={isMobile ? undefined : 180}
          />
          <Select
            clearable
            data={PRODUCTS}
            flex={isMobile ? 1 : undefined}
            onChange={setProduct}
            placeholder="製品"
            searchable
            value={product}
            w={isMobile ? undefined : 180}
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
          placeholder="顧客・製品で検索"
          value={search}
        />
      }
      title="価格表"
    >
      <DataTable
        bulkActions={[
          {
            label: "有効化",
            icon: <IconToggleRight size={16} />,
            color: "green",
          },
          {
            label: "無効化",
            icon: <IconToggleRight size={16} />,
            color: "gray",
          },
          { label: "一括削除", icon: <IconTrash size={16} />, color: "red" },
        ]}
        columns={columns}
        data={filtered}
        defaultSort={{ key: "customerName", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconCurrencyYen size={24} />}
        emptyMessage="価格表がありません"
        getRowId={(e) => e.entryId}
        onRowClick={(e) => router.push(`${BASE_PATH}/${e.entryId}`)}
        renderCard={(e) => {
          const s = entrySummary(e);
          return (
            <Paper p="sm" radius="sm" withBorder>
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack className="min-w-0" gap={3}>
                  <Text fw={600} size="sm" truncate>
                    {e.customerName}
                  </Text>
                  <Text c="dimmed" size="xs" truncate>
                    {e.productName}
                  </Text>
                  <Group gap="xs">
                    <Badge color="gray" size="xs" variant="light">
                      {ORDER_TYPE_LABEL[e.orderType]}
                    </Badge>
                    <Text c="dimmed" size="xs">
                      {s.tierCount}段階
                    </Text>
                  </Group>
                </Stack>
                <Stack align="flex-end" className="shrink-0" gap={4}>
                  <Text className="tabular-nums" ff="mono" size="sm">
                    {priceRangeLabel(s.minPrice, s.maxPrice)}
                  </Text>
                  <ActiveBadge active={e.isActive} />
                </Stack>
              </Group>
            </Paper>
          );
        }}
        rowActions={(e) => [
          {
            label: "有効期間を変えて複製",
            icon: <IconCopy size={14} />,
            onAction: () => setDuplicateTarget(e),
          },
          {
            label: "削除",
            icon: <IconTrash size={14} />,
            color: "red",
            onAction: () => setDeleteTarget(e),
          },
        ]}
        selectable
      />

      <DeletePriceListModal
        onClose={() => setDeleteTarget(null)}
        opened={deleteTarget !== null}
        productName={deleteTarget?.productName ?? ""}
      />
      <DuplicatePriceListModal
        onClose={() => setDuplicateTarget(null)}
        opened={duplicateTarget !== null}
        productName={duplicateTarget?.productName ?? ""}
        unitPrice={duplicateTarget ? entrySummary(duplicateTarget).minPrice : 0}
      />
    </ListShell>
  );
}
