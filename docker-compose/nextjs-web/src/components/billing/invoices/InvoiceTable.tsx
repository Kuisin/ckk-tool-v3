"use client";

/**
 * InvoiceTable — 請求書 一覧 (BL01, design.md §8.1 / §14).
 *
 * Columns: 請求番号 / 顧客 / 請求期間 / 合計金額 / 状態 / 発行日。
 * フィルタ: 検索（番号・顧客）+ 状態。行クリック → 詳細。
 * 新規作成は無し — 請求書は締日処理 (BL02) の「請求書を生成」から作られる。
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconFileInvoice, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate } from "@/lib/format";
import type { Invoice } from "./model";

const BASE_PATH = "/billing/invoices";

/** 請求期間 `yyyy/MM/dd 〜 yyyy/MM/dd`。 */
function periodLabel(inv: Invoice): string {
  return `${formatDate(inv.billingPeriodFrom)} 〜 ${formatDate(inv.billingPeriodTo)}`;
}

export function InvoiceTable({ rows }: { rows: Invoice[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setStatus(null);
  };

  const filtered = rows.filter((inv) => {
    const matchesSearch =
      !search ||
      inv.invoiceNumber.includes(search) ||
      inv.customerName.includes(search) ||
      (inv.customerBranchName ?? "").includes(search);
    const matchesStatus = !status || inv.status === status;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<Invoice>[] = [
    {
      key: "invoiceNumber",
      header: "請求番号",
      sortable: true,
      render: (inv) => (
        <Text ff="mono" size="sm">
          {inv.invoiceNumber}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: "顧客",
      sortable: true,
      render: (inv) => (
        <>
          <Text size="sm">{inv.customerName}</Text>
          {inv.customerBranchName && (
            <Text c="dimmed" size="xs">
              {inv.customerBranchName}
            </Text>
          )}
        </>
      ),
    },
    {
      key: "billingPeriod",
      header: "請求期間",
      sortValue: (inv) => inv.billingPeriodTo,
      render: (inv) => (
        <Text className="tabular-nums" size="sm">
          {periodLabel(inv)}
        </Text>
      ),
    },
    {
      key: "totalAmount",
      header: "合計金額",
      width: 130,
      align: "right",
      sortable: true,
      sortValue: (inv) => inv.totalAmount,
      render: (inv) => <MoneyText value={inv.totalAmount} />,
    },
    {
      key: "status",
      header: "状態",
      width: 100,
      sortValue: (inv) => inv.status,
      render: (inv) => <StatusBadge entity="Invoice" status={inv.status} />,
    },
    {
      key: "issuedAt",
      header: "発行日",
      width: 120,
      sortValue: (inv) => inv.issuedAt ?? "",
      render: (inv) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(inv.issuedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      breadcrumbs={["請求", "請求書"]}
      filters={
        <Select
          clearable
          data={statusOptions("Invoice")}
          flex={isMobile ? 1 : undefined}
          onChange={setStatus}
          placeholder="状態"
          value={status}
          w={isMobile ? undefined : 140}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="請求番号・顧客で検索"
          value={search}
        />
      }
      title="請求書"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "invoiceNumber", dir: "desc" }}
        emptyIcon={<IconFileInvoice size={24} />}
        emptyMessage="請求書がありません（締日処理から生成します）"
        getRowId={(inv) => inv.id}
        onRowClick={(inv) => router.push(`${BASE_PATH}/${inv.id}`)}
        renderCard={(inv) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {inv.invoiceNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {inv.customerName}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {periodLabel(inv)}
              </Text>
              <Group gap="md" mt={2}>
                <MoneyText ta="left" value={inv.totalAmount} />
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="Invoice" status={inv.status} />
              <Text c="dimmed" size="xs">
                {formatDate(inv.issuedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
