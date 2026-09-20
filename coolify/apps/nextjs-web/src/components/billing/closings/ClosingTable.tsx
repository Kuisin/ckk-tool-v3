"use client";

/**
 * ClosingTable — 締日処理 一覧 (BL02, design.md §8.1 / §14).
 *
 * Columns: 顧客 / 締日 / 実行区分 / 合計金額 / 状態 / 処理日。行クリック → 詳細。
 * ヘッダアクション「締日処理を実行」— **指定日**（既定 = 今日）を選んで
 * runClosing(dateIso) を実行する。指定日までに締日が到来し、まだ締めていない
 * 顧客すべての未請求出荷から PENDING 行を作り、締日を過ぎている行はそのまま
 * 請求書（下書き）まで作る（§9 更新 — 旧・月選択の実行はここで置き換わった）。
 */

import {
  Alert,
  Anchor,
  Box,
  Divider,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
  IconCalendarDue,
  IconFileInvoice,
  IconPlayerPlay,
  IconSearch,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import {
  type BulkClosingResult,
  processClosings,
  type RunClosingResult,
  runClosing,
} from "@/app/(dashboard)/billing/closings/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { PrimaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { statusOptions } from "@/lib/status-map";
import { type BillingClosing, isProcessable } from "./model";

const BASE_PATH = "/billing/closings";
const INVOICES_PATH = "/billing/invoices";

/**
 * 締日処理・まとめて請求書生成の結果ポップアップ — 件数だけの通知ではなく、
 * 作成した請求書を直接開けるようにする（顧客名・金額付きの一覧 + リンク）。
 */
function ClosingResultModal({
  opened,
  onClose,
  title,
  summary,
  invoices,
  failures,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  summary?: ReactNode;
  invoices: RunClosingResult["invoices"];
  failures: RunClosingResult["failures"];
}) {
  const tr = useTranslations();
  const router = useRouter();

  return (
    <ModalShell
      cancelLabel={tr("common.close")}
      confirmLabel={
        invoices.length > 0
          ? tr("billing.closingTable.openInvoiceList")
          : undefined
      }
      onClose={onClose}
      onConfirm={
        invoices.length > 0
          ? () => {
              onClose();
              router.push(INVOICES_PATH);
            }
          : undefined
      }
      opened={opened}
      size="md"
      title={title}
    >
      <Stack gap="sm">
        {summary}
        {invoices.length > 0 ? (
          <Stack gap={4}>
            <Text c="dimmed" size="xs">
              {tr("billing.closingTable.createdInvoicesHeading", {
                count: invoices.length,
              })}
            </Text>
            <ScrollArea.Autosize mah={280}>
              <Stack gap={0}>
                {invoices.map((inv, i) => (
                  <Box key={inv.invoiceNumber}>
                    {i > 0 && <Divider />}
                    <Anchor
                      component={Link}
                      href={`${INVOICES_PATH}/${inv.invoiceNumber}`}
                      onClick={onClose}
                      underline="never"
                    >
                      <Group justify="space-between" py="xs" wrap="nowrap">
                        <Stack className="min-w-0" gap={2}>
                          <DocNumber>{inv.invoiceNumber}</DocNumber>
                          <Text c="dimmed" size="xs" truncate>
                            {inv.customerName}
                          </Text>
                        </Stack>
                        <MoneyText value={inv.totalAmount} />
                      </Group>
                    </Anchor>
                  </Box>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </Stack>
        ) : (
          <Text c="dimmed" size="sm">
            {tr("billing.closingTable.noInvoicesCreated")}
          </Text>
        )}
        {failures.length > 0 && (
          <Alert
            color="red"
            title={tr("billing.closingTable.failuresHeading", {
              count: failures.length,
            })}
          >
            <Stack gap={4}>
              {failures.map((f) => (
                <Text key={`${f.customerName}:${f.error}`} size="sm">
                  {f.customerName}: {f.error}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}
      </Stack>
    </ModalShell>
  );
}

/** Date → "YYYY-MM-DD"（ローカル日時のまま、UTC に変換しない）。 */
function isoFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 「締日処理を実行」モーダル — 指定日（既定 = 今日）を選んで runClosing。 */
function RunClosingModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const todayIso = isoFromDate(new Date());
  // 指定日は URL に保持（既定 = 今日のときはパラメータ省略）
  const [dateIso, setDateIso] = useUrlStringState("date", todayIso);
  // 実行結果は件数の通知ではなくポップアップで見せる（作成した請求書を
  // その場で開ける）。このモーダル自身は opened=false でも DOM に残るので、
  // 「実行」モーダルを閉じたあとも結果ポップアップは表示され続ける。
  const [result, setResult] = useState<RunClosingResult | null>(null);

  const execute = () => {
    startTransition(async () => {
      const res = await runClosing(dateIso);
      if (res.ok) {
        onClose();
        setResult(res.data);
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  return (
    <>
      <ModalShell
        confirmLabel={tr("common.run2")}
        loading={isPending}
        onClose={onClose}
        onConfirm={execute}
        opened={opened}
        size="sm"
        title={tr("billing.closings.runTheBillingClosing")}
      >
        <Text mb="sm" size="sm">
          {tr("billing.closings.aggregatesUnbilledShipmentsUpToDate")}
        </Text>
        <DatePickerInput
          label={tr("billing.closings.targetDate")}
          onChange={(v) => v && setDateIso(v)}
          value={dateIso}
          valueFormat="YYYY/MM/DD"
        />
      </ModalShell>
      <ClosingResultModal
        failures={result?.failures ?? []}
        invoices={result?.invoices ?? []}
        onClose={() => setResult(null)}
        opened={result !== null}
        summary={
          result && (
            <Text size="sm">
              {tr("billing.closingTable.createdAndUpdatedCounts", {
                created: result.created,
                updated: result.updated,
              })}
              {result.skipped > 0
                ? ` / ${tr("billing.closingTable.skippedCount", { skipped: result.skipped })}`
                : ""}
            </Text>
          )
        }
        title={tr("billing.closingTable.resultModalTitle")}
      />
    </>
  );
}

export function ClosingTable({
  rows,
  todayIso,
}: {
  rows: BillingClosing[];
  /** JST の今日（"YYYY-MM-DD"）— 締日を過ぎたかの判定に使う。サーバーが渡す。 */
  todayIso: string;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");
  const [runOpen, setRunOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState<
    (BulkClosingResult & { skippedNotReady: number }) | null
  >(null);

  const reset = () => {
    setSearch(null);
    setStatus(null);
  };

  const filtered = rows.filter((c) => {
    const matchesSearch = !search || c.customerName.includes(search);
    const matchesStatus = !status || c.status === status;
    return matchesSearch && matchesStatus;
  });

  /**
   * 選んだ行をまとめて請求書にする。
   *
   * **処理できない行は先に外す**（未処理でない / 締日前）。混ざったまま投げると
   * 「N 件中 M 件失敗」と出るだけで、何が悪かったのかは結局 1 件ずつ開いて
   * 確かめることになる。判定は画面のボタン活性と同じ isProcessable。
   */
  const bulkProcess = (targets: BillingClosing[]) => {
    const ready = targets.filter((c) => isProcessable(c, todayIso));
    const skipped = targets.length - ready.length;
    if (ready.length === 0) {
      notifications.show({
        title: tr("billing.closings.nothingToProcess"),
        message: tr("billing.closings.selectPendingPastClosingDate"),
        color: "orange",
      });
      return;
    }
    startTransition(async () => {
      const result = await processClosings(ready.map((c) => c.id));
      if (!result.ok) {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
        return;
      }
      setBulkResult({ ...result.data, skippedNotReady: skipped });
      router.refresh();
    });
  };

  /** 実行区分の表示ラベル（定期 / 手動）。 */
  const kindLabel = (kind: BillingClosing["kind"]) =>
    kind === "MANUAL"
      ? tr("billing.closings.kindManual")
      : tr("billing.closings.kindScheduled");

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
      key: "kind",
      header: tr("billing.closings.kind"),
      width: 90,
      sortValue: (c) => c.kind,
      render: (c) => (
        <Text c="dimmed" size="sm">
          {kindLabel(c.kind)}
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
          aria-label={tr("common.status")}
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
          aria-label={tr("billing.closings.searchByCustomer")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("billing.closings.searchByCustomer")}
          value={search}
        />
      }
      title={tr("common.billingClosing")}
    >
      <DataTable
        bulkActions={[
          {
            label: tr("billing.closings.generateInvoicesInBulk"),
            icon: <IconFileInvoice size={16} />,
            color: "blue",
            onAction: bulkProcess,
          },
        ]}
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
                {" · "}
                {kindLabel(c.kind)}
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
        selectable
        urlState
      />

      <RunClosingModal onClose={() => setRunOpen(false)} opened={runOpen} />
      <ClosingResultModal
        failures={bulkResult?.failures ?? []}
        invoices={bulkResult?.invoices ?? []}
        onClose={() => setBulkResult(null)}
        opened={bulkResult !== null}
        summary={
          bulkResult && bulkResult.skippedNotReady > 0 ? (
            <Text c="dimmed" size="sm">
              {tr("billing.closings.skippedNotReady", {
                count: bulkResult.skippedNotReady,
              })}
            </Text>
          ) : undefined
        }
        title={tr("billing.closingTable.bulkResultModalTitle")}
      />
    </ListShell>
  );
}
