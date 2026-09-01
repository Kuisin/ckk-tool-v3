"use client";

/**
 * ClosingTable — 締日処理 一覧 (BL02, design.md §8.1 / §14).
 *
 * Columns: 顧客 / 締日 / 合計金額 / 状態 / 処理日。行クリック → 詳細。
 * ヘッダアクション「締日処理を実行」— 対象月（年・月 Select）を選んで
 * runClosing(yearMonth) を実行し、未請求出荷から PENDING 行を作成/更新する。
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCalendarDue,
  IconPlayerPlay,
  IconSearch,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { runClosing } from "@/app/(dashboard)/billing/closings/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { PrimaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { statusOptions } from "@/lib/status-map";
import type { BillingClosing } from "./model";

const BASE_PATH = "/billing/closings";

/** 「締日処理を実行」モーダル — 対象月を選んで runClosing。 */
function RunClosingModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();

  /** 対象月の選択肢 — 前年〜当年（実行は過去月が主）。 */
  const yearOptions = (): { value: string; label: string }[] => {
    const current = new Date().getFullYear();
    return [current - 1, current].map((y) => ({
      value: String(y),
      label: tr("billing.closingTable.yearLabel", { year: y }),
    }));
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: tr("billing.closingTable.monthLabel", { month: i + 1 }),
  }));
  const [isPending, startTransition] = useTransition();
  const now = new Date();
  // 対象月は URL に保持（既定 = 当年・当月のときはパラメータ省略）
  const [year, setYear] = useUrlStringState("year", String(now.getFullYear()));
  const [month, setMonth] = useUrlStringState(
    "month",
    String(now.getMonth() + 1).padStart(2, "0"),
  );

  const execute = () => {
    startTransition(async () => {
      const result = await runClosing(`${year}${month}`);
      if (result.ok) {
        const { created, updated, skipped } = result.data;
        notifications.show({
          title: tr("billing.closings.theBillingClosingWasRun"),
          message:
            tr("billing.closingTable.createdAndUpdatedCounts", {
              created,
              updated,
            }) +
            (skipped > 0
              ? ` / ${tr("billing.closingTable.skippedCount", { skipped })}`
              : ""),
          color: "green",
        });
        onClose();
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <ModalShell
      confirmLabel={tr("common.run2")}
      loading={isPending}
      onClose={onClose}
      onConfirm={execute}
      opened={opened}
      size="sm"
      title={tr("billing.closings.runTheBillingClosing")}
    >
      <Text size="sm">
        {tr("billing.closings.aggregatesTheMonthSUnbilledShipments")}
      </Text>
      <Group grow>
        <Select
          allowDeselect={false}
          data={yearOptions()}
          label={tr("billing.closings.years")}
          onChange={(v) => v && setYear(v)}
          value={year}
        />
        <Select
          allowDeselect={false}
          data={monthOptions}
          label={tr("billing.closings.months")}
          onChange={(v) => v && setMonth(v)}
          value={month}
        />
      </Group>
    </ModalShell>
  );
}

export function ClosingTable({ rows }: { rows: BillingClosing[] }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");
  const [runOpen, setRunOpen] = useState(false);

  const reset = () => {
    setSearch(null);
    setStatus(null);
  };

  const filtered = rows.filter((c) => {
    const matchesSearch = !search || c.customerName.includes(search);
    const matchesStatus = !status || c.status === status;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<BillingClosing>[] = [
    {
      key: "customerName",
      header: tr("common.customer"),
      sortable: true,
      render: (c) => <Text size="sm">{c.customerName}</Text>,
    },
    {
      key: "closingDate",
      header: tr("common.closingDay"),
      width: 130,
      sortable: true,
      sortValue: (c) => c.closingDate,
      render: (c) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(c.closingDate)}
        </Text>
      ),
    },
    {
      key: "totalAmount",
      header: tr("common.totalAmount"),
      width: 130,
      align: "right",
      sortValue: (c) => c.totalAmount ?? 0,
      render: (c) => <MoneyText value={c.totalAmount} />,
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 120,
      sortValue: (c) => c.status,
      render: (c) => <StatusBadge entity="BillingClosing" status={c.status} />,
    },
    {
      key: "processedAt",
      header: tr("common.processedOn"),
      width: 120,
      sortValue: (c) => c.processedAt ?? "",
      render: (c) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(c.processedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={
        <PrimaryButton
          leftSection={<IconPlayerPlay size={14} />}
          onClick={() => setRunOpen(true)}
          style={{ flexShrink: 0 }}
        >
          {isMobile
            ? tr("common.run2")
            : tr("billing.closings.runTheBillingClosing2")}
        </PrimaryButton>
      }
      breadcrumbs={[tr("common.billing"), tr("common.billingClosing")]}
      filters={
        <Select
          clearable
          data={statusOptions("BillingClosing")}
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
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("billing.closings.searchByCustomer")}
          value={search}
        />
      }
      title={tr("common.billingClosing")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "closingDate", dir: "desc" }}
        emptyIcon={<IconCalendarDue size={24} />}
        emptyMessage={tr("billing.closings.thereAreNoBillingClosingsCreate")}
        getRowId={(c) => c.id}
        onRowClick={(c) => router.push(`${BASE_PATH}/${c.id}`)}
        renderCard={(c) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text fw={600} size="sm" truncate>
                {c.customerName}
              </Text>
              <Text c="dimmed" size="xs">
                {tr("common.closingDay")}: {fmt.date(c.closingDate)}
              </Text>
              <Group gap="md" mt={2}>
                <MoneyText ta="left" value={c.totalAmount} />
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="BillingClosing" status={c.status} />
              <Text c="dimmed" size="xs">
                {fmt.date(c.processedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />

      <RunClosingModal onClose={() => setRunOpen(false)} opened={runOpen} />
    </ListShell>
  );
}
