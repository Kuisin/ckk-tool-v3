"use client";

/**
 * AccountingDocumentsTable — 会計文書履歴（SY0J 配下の簡易な一覧）。
 *
 * SAP の FB03（文書表示）に相当する最低限 — 転記・反対仕訳した会計文書を
 * 横断で見られるようにするだけで、専用の詳細ページは持たない。行をクリック
 * すると請求書詳細（会計文書履歴パネル・反対仕訳の操作はそちら）を開く。
 */

import { Group, Select, Text, TextInput } from "@mantine/core";
import { IconFileSpreadsheet, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import type { AccountingDocumentSummary } from "@/lib/accounting-documents";
import { statusOptions } from "@/lib/status-map";

export function AccountingDocumentsTable({
  documents,
}: {
  documents: AccountingDocumentSummary[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setStatus(null);
  };

  const filtered = documents.filter((d) => {
    const matchesSearch =
      !search ||
      d.documentNumber.includes(search) ||
      d.invoiceNumber.includes(search);
    const matchesStatus = !status || d.status === status;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<AccountingDocumentSummary>[] = [
    {
      key: "documentNumber",
      header: tr("billing.accountingDocuments.documentNumber"),
      sortable: true,
      render: (d) => <DocNumber>{d.documentNumber}</DocNumber>,
    },
    {
      key: "invoiceNumber",
      header: tr("common.invoice"),
      sortable: true,
      render: (d) => <DocNumber c="blue">{d.invoiceNumber}</DocNumber>,
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 130,
      sortValue: (d) => d.status,
      render: (d) => (
        <StatusBadge entity="AccountingDocument" status={d.status} />
      ),
    },
    {
      key: "postedAt",
      header: tr("billing.accountingDocuments.postedAtLabel"),
      width: 160,
      sortable: true,
      render: (d) => (
        <Text className="tabular-nums" size="sm">
          {fmt.dateTime(d.postedAt)}
        </Text>
      ),
    },
    {
      key: "postedByName",
      header: tr("common.createdBy"),
      render: (d) => <Text size="sm">{d.postedByName ?? "—"}</Text>,
    },
    {
      key: "totalDebit",
      header: tr("common.totalAmount"),
      width: 130,
      align: "right",
      sortValue: (d) => d.totalDebit,
      render: (d) => <MoneyText value={d.totalDebit} />,
    },
  ];

  return (
    <ListShell
      breadcrumbs={[
        tr("common.system"),
        tr("settings.accounting.accounting"),
        tr("billing.accountingDocuments.documentsList"),
      ]}
      filters={
        <Select
          aria-label={tr("common.status")}
          clearable
          data={statusOptions("AccountingDocument")}
          flex={isMobile ? 1 : undefined}
          onChange={setStatus}
          placeholder={tr("common.status")}
          value={status}
          w={isMobile ? undefined : 160}
        />
      }
      onReset={reset}
      search={
        <TextInput
          aria-label={tr("billing.accountingDocuments.documentNumber")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("billing.accountingDocuments.documentNumber")}
          value={search}
        />
      }
      title={tr("billing.accountingDocuments.documentsList")}
    >
      <Text c="dimmed" mb="sm" size="sm">
        {tr("billing.accountingDocuments.documentsListDescription")}
      </Text>
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "postedAt", dir: "desc" }}
        emptyIcon={<IconFileSpreadsheet size={24} />}
        emptyMessage={tr("billing.accountingDocuments.notPostedYet")}
        getRowId={(d) => d.documentNumber}
        onRowClick={(d) => router.push(`/billing/invoices/${d.invoiceNumber}`)}
        renderCard={(d) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <div className="min-w-0">
              <DocNumber>{d.documentNumber}</DocNumber>
              <Text c="dimmed" size="xs">
                {d.invoiceNumber}
              </Text>
            </div>
            <Group gap="xs">
              <StatusBadge entity="AccountingDocument" status={d.status} />
              <MoneyText value={d.totalDebit} />
            </Group>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
