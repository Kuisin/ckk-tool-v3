"use client";

/**
 * QuoteTable — 見積書 一覧 (design.md §8.1 / §14).
 *
 * Columns: 見積番号 / 顧客 / 有効期限 / 状態 / 更新日 (+ 合計金額, hideable).
 * Row click → the quote's detail page. Replace MOCK_QUOTES with server data +
 * URL-param filters later.
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconFileText, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate, formatDateTime } from "@/lib/format";
import { CUSTOMERS } from "@/lib/mock";
import { MOCK_QUOTES, type Quote, quoteTotals } from "./mock";

const BASE_PATH = "/sales/quotes";

export function QuoteTable() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const reset = () => {
    setSearch("");
    setCustomer(null);
    setStatus(null);
  };

  const filtered = MOCK_QUOTES.filter((q) => {
    const matchesSearch =
      !search ||
      q.quoteNumber.includes(search) ||
      q.customerName.includes(search);
    const matchesCustomer = !customer || q.customerName === customer;
    const matchesStatus = !status || q.status === status;
    return matchesSearch && matchesCustomer && matchesStatus;
  });

  const columns: Column<Quote>[] = [
    {
      key: "quoteNumber",
      header: "見積番号",
      sortable: true,
      render: (q) => (
        <Text ff="mono" size="sm">
          {q.quoteNumber}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: "顧客",
      sortable: true,
      render: (q) => q.customerName,
    },
    {
      key: "validUntil",
      header: "有効期限",
      width: 130,
      sortValue: (q) => q.validUntil ?? "",
      render: (q) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(q.validUntil)}
        </Text>
      ),
    },
    {
      key: "total",
      header: "合計金額",
      align: "right",
      hideable: true,
      width: 140,
      sortValue: (q) => quoteTotals(q).grandTotal,
      render: (q) => <MoneyText value={quoteTotals(q).grandTotal} />,
    },
    {
      key: "status",
      header: "状態",
      width: 100,
      sortValue: (q) => q.status,
      render: (q) => <StatusBadge entity="Quote" status={q.status} />,
    },
    {
      key: "updatedAt",
      header: "更新日",
      hideable: true,
      width: 150,
      sortValue: (q) => q.updatedAt,
      render: (q) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {formatDateTime(q.updatedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["販売", "見積書"]}
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
            data={statusOptions("Quote")}
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
          placeholder="見積番号・顧客で検索"
          value={search}
        />
      }
      title="見積書"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconFileText size={24} />}
        emptyMessage="見積書がありません"
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
                有効期限 {formatDate(q.validUntil)}
              </Text>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <MoneyText value={quoteTotals(q).grandTotal} />
              <StatusBadge entity="Quote" status={q.status} />
            </Stack>
          </Group>
        )}
      />
    </ListShell>
  );
}
