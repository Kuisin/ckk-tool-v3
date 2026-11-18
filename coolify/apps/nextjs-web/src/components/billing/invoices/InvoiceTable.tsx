"use client";

/**
 * InvoiceTable — 請求書 一覧 (BL01, design.md §8.1 / §14).
 *
 * Columns: 請求番号 / 顧客 / 請求期間 / 合計金額 / 状態 / 発行日。
 * フィルタ: 検索（番号・顧客）+ 状態。行クリック → 詳細。
 * 新規作成は「手動請求」（BL11 — 締日を待たず、選んだ出荷から起こす臨時請求）。
 * 通常の請求書は締日処理 (BL02) の「請求書を生成」から作られる。
 *
 * 一括操作（§9 更新）— 発行 / 入金依頼 / 承認・差し戻し。**1 件ずつ独立して
 * 処理する**（closings/actions.ts processClosings と同じ規約）。承認が要る
 * 請求書を一括発行の対象から外さない — 何が止まったかは失敗一覧に出す。
 */

import { Group, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileInvoice, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  approveInvoices,
  type BulkInvoiceResult,
  issueInvoices,
  rejectInvoices,
  requestInvoicePayments,
} from "@/app/(dashboard)/billing/invoices/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { CreateButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import type { Formatters } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import { statusOptions } from "@/lib/status-map";
import { canActOnApproval, type Invoice } from "./model";

const BASE_PATH = "/billing/invoices";

/** 請求期間 `yyyy/MM/dd 〜 yyyy/MM/dd`（日付形式はユーザーの表示設定）。 */
function periodLabel(fmt: Formatters, inv: Invoice): string {
  return `${fmt.date(inv.billingPeriodFrom)} 〜 ${fmt.date(inv.billingPeriodTo)}`;
}

export function InvoiceTable({ rows }: { rows: Invoice[] }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();
  const [isPending, startRejectTransition] = useTransition();
  const [rejectTargets, setRejectTargets] = useState<Invoice[] | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

  /** 一括操作の結果を「済/未」で通知する共通の見せ方（processClosings と同じ）。 */
  const showBulkResult = (
    result: ActionResult<BulkInvoiceResult>,
    doneTitle: (count: number) => string,
  ) => {
    if (!result.ok) {
      notifications.show({
        title: tr("common.error2"),
        message: result.error,
        color: "red",
      });
      return;
    }
    const { done, failures } = result.data;
    if (failures.length > 0) {
      notifications.show({
        title: tr("billing.closings.someCouldNotBeProcessed", {
          count: failures.length,
        }),
        message: failures.map((f) => `${f.number}: ${f.error}`).join(" / "),
        color: "red",
        autoClose: false,
      });
    }
    if (done.length > 0) {
      notifications.show({
        title: doneTitle(done.length),
        message: done.join(" / "),
        color: "green",
      });
    }
    router.refresh();
  };

  /** 一括発行 — DRAFT のみ対象。押せない行（発行前承認待ち等）は理由つきで失敗する。 */
  const bulkIssue = (targets: Invoice[]) => {
    const ready = targets.filter((inv) => inv.status === "DRAFT");
    if (ready.length === 0) {
      notifications.show({
        title: tr("billing.invoiceTable.nothingToIssue"),
        message: tr("billing.invoiceTable.selectDraftInvoices"),
        color: "orange",
      });
      return;
    }
    startTransition(async () => {
      const result = await issueInvoices(ready.map((inv) => inv.invoiceNumber));
      showBulkResult(result, (count) =>
        tr("billing.invoiceTable.issuedCount", { count }),
      );
    });
  };

  /** 一括入金 — SENT のみ対象。段が組んであれば依頼が立つだけ（markPaid と同じ）。 */
  const bulkRequestPayment = (targets: Invoice[]) => {
    const ready = targets.filter((inv) => inv.status === "SENT");
    if (ready.length === 0) {
      notifications.show({
        title: tr("billing.invoiceTable.nothingToMarkPaid"),
        message: tr("billing.invoiceTable.selectSentInvoices"),
        color: "orange",
      });
      return;
    }
    startTransition(async () => {
      const result = await requestInvoicePayments(
        ready.map((inv) => inv.invoiceNumber),
      );
      showBulkResult(result, (count) =>
        tr("billing.invoiceTable.paymentProcessedCount", { count }),
      );
    });
  };

  /** 一括承認 — 依頼中（発行前・入金前のどちらか）だけ対象。 */
  const bulkApprove = (targets: Invoice[]) => {
    const ready = targets.filter(canActOnApproval);
    if (ready.length === 0) {
      notifications.show({
        title: tr("billing.invoiceTable.nothingToApprove"),
        message: tr("billing.invoiceTable.selectPendingApprovalInvoices"),
        color: "orange",
      });
      return;
    }
    startTransition(async () => {
      const result = await approveInvoices(
        ready.map((inv) => inv.invoiceNumber),
      );
      showBulkResult(result, (count) =>
        tr("billing.invoiceTable.approvedCount", { count }),
      );
    });
  };

  const bulkReject = (targets: Invoice[]) => {
    const ready = targets.filter(canActOnApproval);
    if (ready.length === 0) {
      notifications.show({
        title: tr("billing.invoiceTable.nothingToApprove"),
        message: tr("billing.invoiceTable.selectPendingApprovalInvoices"),
        color: "orange",
      });
      return;
    }
    setRejectTargets(ready);
    setRejectReason("");
  };

  const confirmBulkReject = () => {
    if (!rejectTargets || !rejectReason.trim()) return;
    startRejectTransition(async () => {
      const result = await rejectInvoices(
        rejectTargets.map((inv) => inv.invoiceNumber),
        rejectReason,
      );
      showBulkResult(result, (count) =>
        tr("billing.invoiceTable.rejectedCount", { count }),
      );
      setRejectTargets(null);
    });
  };

  const columns: Column<Invoice>[] = [
    {
      key: "invoiceNumber",
      header: tr("common.invoiceNumber"),
      sortable: true,
      render: (inv) => (
        <Text ff="mono" size="sm">
          {inv.invoiceNumber}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: tr("common.customer"),
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
      header: tr("common.billingPeriod"),
      sortValue: (inv) => inv.billingPeriodTo,
      render: (inv) => (
        <Text className="tabular-nums" size="sm">
          {periodLabel(fmt, inv)}
        </Text>
      ),
    },
    {
      key: "totalAmount",
      header: tr("common.totalAmount"),
      width: 130,
      align: "right",
      sortable: true,
      sortValue: (inv) => inv.totalAmount,
      render: (inv) => <MoneyText value={inv.totalAmount} />,
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 100,
      sortValue: (inv) => inv.status,
      render: (inv) => (
        <Group gap={4} wrap="nowrap">
          <StatusBadge entity="Invoice" status={inv.status} />
          {inv.approvalStatus === "PENDING" && (
            <Text c="orange" size="xs">
              {tr("common.pendingApproval")}
            </Text>
          )}
        </Group>
      ),
    },
    {
      key: "issuedAt",
      header: tr("common.issueDate"),
      width: 120,
      sortValue: (inv) => inv.issuedAt ?? "",
      render: (inv) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(inv.issuedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={
        <CreateButton href={`${BASE_PATH}/new`} style={{ flexShrink: 0 }}>
          {isMobile
            ? tr("common.new")
            : tr("billing.invoiceTable.manualInvoice")}
        </CreateButton>
      }
      breadcrumbs={[tr("common.billing"), tr("common.invoice")]}
      filters={
        <Select
          aria-label={tr("common.status")}
          clearable
          data={statusOptions("Invoice")}
          flex={isMobile ? 1 : undefined}
          onChange={setStatus}
          placeholder={tr("common.status")}
          value={status}
          w={isMobile ? undefined : 140}
        />
      }
      onReset={reset}
      search={
        <TextInput
          aria-label={tr("billing.invoices.searchByInvoiceNumberOrCustomer")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("billing.invoices.searchByInvoiceNumberOrCustomer")}
          value={search}
        />
      }
      title={tr("common.invoice")}
    >
      <DataTable
        bulkActions={[
          {
            label: tr("common.issue"),
            color: "blue",
            onAction: bulkIssue,
          },
          {
            label: tr("billing.invoices.markAsPaid"),
            color: "blue",
            onAction: bulkRequestPayment,
          },
          {
            label: tr("common.approve"),
            color: "green",
            onAction: bulkApprove,
          },
          {
            label: tr("common.reject"),
            color: "red",
            onAction: bulkReject,
          },
        ]}
        columns={columns}
        data={filtered}
        defaultSort={{ key: "invoiceNumber", dir: "desc" }}
        emptyIcon={<IconFileInvoice size={24} />}
        emptyMessage={tr("billing.invoices.thereAreNoInvoicesGenerateThem")}
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
                {periodLabel(fmt, inv)}
              </Text>
              <Group gap="md" mt={2}>
                <MoneyText ta="left" value={inv.totalAmount} />
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="Invoice" status={inv.status} />
              <Text c="dimmed" size="xs">
                {fmt.date(inv.issuedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        selectable
        urlState
      />

      <ModalShell
        confirmColor="red"
        confirmDisabled={!rejectReason.trim()}
        confirmLabel={tr("common.sendBack")}
        loading={isPending}
        onClose={() => setRejectTargets(null)}
        onConfirm={confirmBulkReject}
        opened={rejectTargets != null}
        title={tr("common.confirmSendingBack")}
      >
        <Text mb="sm" size="sm">
          {tr("common.enterAReasonForSendingIt")}
        </Text>
        <Textarea
          autosize
          minRows={3}
          onChange={(e) => setRejectReason(e.currentTarget.value)}
          value={rejectReason}
          withAsterisk
        />
      </ModalShell>
    </ListShell>
  );
}
