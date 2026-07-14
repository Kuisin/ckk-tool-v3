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
import { useState, useTransition } from "react";
import { runClosing } from "@/app/(dashboard)/billing/closings/actions";
import { PrimaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate } from "@/lib/format";
import type { BillingClosing } from "./model";

const BASE_PATH = "/billing/closings";

/** 対象月の選択肢 — 前年〜当年（実行は過去月が主）。 */
function yearOptions(): { value: string; label: string }[] {
  const current = new Date().getFullYear();
  return [current - 1, current].map((y) => ({
    value: String(y),
    label: `${y}年`,
  }));
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, "0"),
  label: `${i + 1}月`,
}));

/** 「締日処理を実行」モーダル — 対象月を選んで runClosing。 */
function RunClosingModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(
    String(now.getMonth() + 1).padStart(2, "0"),
  );

  const execute = () => {
    startTransition(async () => {
      const result = await runClosing(`${year}${month}`);
      if (result.ok) {
        const { created, updated, skipped } = result.data;
        notifications.show({
          title: "締日処理を実行しました",
          message: `作成 ${created} 件 / 更新 ${updated} 件${skipped > 0 ? ` / 処理済みスキップ ${skipped} 件` : ""}`,
          color: "green",
        });
        onClose();
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <ModalShell
      confirmLabel="実行"
      loading={isPending}
      onClose={onClose}
      onConfirm={execute}
      opened={opened}
      size="sm"
      title="締日処理の実行"
    >
      <Text size="sm">
        対象月の未請求出荷（出荷済み・発送のみ）を顧客ごとに集計し、締日の処理行を作成します。
      </Text>
      <Group grow>
        <Select
          allowDeselect={false}
          data={yearOptions()}
          label="年"
          onChange={(v) => v && setYear(v)}
          value={year}
        />
        <Select
          allowDeselect={false}
          data={MONTH_OPTIONS}
          label="月"
          onChange={(v) => v && setMonth(v)}
          value={month}
        />
      </Group>
    </ModalShell>
  );
}

export function ClosingTable({ rows }: { rows: BillingClosing[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [runOpen, setRunOpen] = useState(false);

  const reset = () => {
    setSearch("");
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
      header: "顧客",
      sortable: true,
      render: (c) => <Text size="sm">{c.customerName}</Text>,
    },
    {
      key: "closingDate",
      header: "締日",
      width: 130,
      sortable: true,
      sortValue: (c) => c.closingDate,
      render: (c) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(c.closingDate)}
        </Text>
      ),
    },
    {
      key: "totalAmount",
      header: "合計金額",
      width: 130,
      align: "right",
      sortValue: (c) => c.totalAmount ?? 0,
      render: (c) => <MoneyText value={c.totalAmount} />,
    },
    {
      key: "status",
      header: "状態",
      width: 120,
      sortValue: (c) => c.status,
      render: (c) => <StatusBadge entity="BillingClosing" status={c.status} />,
    },
    {
      key: "processedAt",
      header: "処理日",
      width: 120,
      sortValue: (c) => c.processedAt ?? "",
      render: (c) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(c.processedAt)}
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
          {isMobile ? "実行" : "締日処理を実行"}
        </PrimaryButton>
      }
      breadcrumbs={["請求", "締日処理"]}
      filters={
        <Select
          clearable
          data={statusOptions("BillingClosing")}
          flex={isMobile ? 1 : undefined}
          onChange={setStatus}
          placeholder="状態"
          value={status}
          w={isMobile ? undefined : 160}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="顧客で検索"
          value={search}
        />
      }
      title="締日処理"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "closingDate", dir: "desc" }}
        emptyIcon={<IconCalendarDue size={24} />}
        emptyMessage="締日処理がありません（「締日処理を実行」から作成します）"
        getRowId={(c) => c.id}
        onRowClick={(c) => router.push(`${BASE_PATH}/${c.id}`)}
        renderCard={(c) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text fw={600} size="sm" truncate>
                {c.customerName}
              </Text>
              <Text c="dimmed" size="xs">
                締日: {formatDate(c.closingDate)}
              </Text>
              <Group gap="md" mt={2}>
                <MoneyText ta="left" value={c.totalAmount} />
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="BillingClosing" status={c.status} />
              <Text c="dimmed" size="xs">
                {formatDate(c.processedAt)}
              </Text>
            </Stack>
          </Group>
        )}
      />

      <RunClosingModal onClose={() => setRunOpen(false)} opened={runOpen} />
    </ListShell>
  );
}
