"use client";

/**
 * QuoteTable — 見積書 一覧 (design.md §8.1 / §14).
 *
 * Columns: 見積番号 / 顧客 / 有効期限 / 状態 / 更新日 (+ 合計金額, hideable).
 * Row click → the quote's detail page. Rows come from sales.quotes via the
 * server page.
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconFileText, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import type { Option } from "@/lib/mock";
import { statusOptions } from "@/lib/status-map";
import { type Quote, quoteTotals } from "./model";

const BASE_PATH = "/sales/quotes";

export function QuoteTable({
  rows,
  customerOptions,
}: {
  rows: Quote[];
  customerOptions: Option[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [customer, setCustomer] = useUrlSelectState("customer");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setCustomer(null);
    setStatus(null);
  };

  const filtered = rows.filter((q) => {
    const matchesSearch =
      !search ||
      q.quoteNumber.includes(search) ||
      q.customerName.includes(search);
    const matchesCustomer = !customer || q.customerId === customer;
    const matchesStatus = !status || q.status === status;
    return matchesSearch && matchesCustomer && matchesStatus;
  });

  const columns: Column<Quote>[] = [
    {
      key: "quoteNumber",
      header: tr("common.quoteNumber"),
      sortable: true,
      render: (q) => (
        <Text ff="mono" size="sm">
          {q.quoteNumber}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: tr("common.customer"),
      sortable: true,
      render: (q) => q.customerName,
    },
    {
      key: "validUntil",
      header: tr("common.validUntil2"),
      width: 130,
      sortValue: (q) => q.validUntil ?? "",
      render: (q) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(q.validUntil)}
        </Text>
      ),
    },
    {
      key: "total",
      header: tr("common.totalAmount"),
      align: "right",
      hideable: true,
      width: 140,
      sortValue: (q) => quoteTotals(q).grandTotal,
      render: (q) => <MoneyText value={quoteTotals(q).grandTotal} />,
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 100,
      sortValue: (q) => q.status,
      render: (q) => <StatusBadge entity="Quote" status={q.status} />,
    },
    {
      key: "updatedAt",
      header: tr("common.updated"),
      hideable: true,
      width: 150,
      sortValue: (q) => q.updatedAt,
      render: (q) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {fmt.dateTime(q.updatedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("common.sales"), tr("common.quote")]}
      filters={
        <>
          <Select
            clearable
            data={customerOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setCustomer}
            placeholder={tr("common.customer")}
            searchable
            value={customer}
            w={isMobile ? undefined : 180}
          />
          <Select
            clearable
            data={statusOptions("Quote")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder={tr("common.status")}
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
          placeholder={tr("sales.quotes.searchByQuoteNumberOrCustomer")}
          value={search}
        />
      }
      title={tr("common.quote")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconFileText size={24} />}
        emptyMessage={tr("sales.quotes.thereAreNoQuotes")}
        getRowId={(q) => q.id}
        onRowClick={(q) => router.push(`${BASE_PATH}/${q.id}`)}
        renderCard={(q) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {q.quoteNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {q.customerName}
              </Text>
              <Text c="dimmed" size="xs">
                有効期限 {fmt.date(q.validUntil)}
              </Text>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <MoneyText value={quoteTotals(q).grandTotal} />
              <StatusBadge entity="Quote" status={q.status} />
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
