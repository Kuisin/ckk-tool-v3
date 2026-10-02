"use client";

/**
 * InvoiceApprovalCard — 請求書の「いま何をすべきか」カード（§9, design.md §10.9）。
 *
 * 請求書には承認が **2 か所**あり、`invoice.status` でどちらかが決まる
 * （DRAFT = 発行前承認 / SENT = 入金前承認。どちらも `approvalStatus` の
 * 1 列を共用する — 同時に開かないので denormalize した列は 1 組で足りる）。
 *
 * `DeliveryVarianceCard.tsx` と同じ作法で「承認を依頼する」ボタンは持たない
 * — 依頼は「発行」「入金」を押した時点でサーバー（invoices/actions.ts の
 * guardIssueApproval / markPaid）が必要と判断したときだけ自動で出る。
 * 押す場所を増やさないことで、依頼の押し忘れが起きる余地を作らない。
 *
 * 発行前承認だけ、承認者への文言を**手動費用の内容**で分ける（利用者の要望 —
 * 身に覚えのない請求が外へ出る前に、承認者が中身を見て判断できるように）。
 */

import { Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowBackUp, IconCheck, IconClock } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ActionCard } from "@/components/ui/ActionCard";
import { ApproveButton, RejectButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import { hasManualCharge, type Invoice } from "./model";

export function InvoiceApprovalCard({
  invoice,
  canAct,
  onApprove,
  onReject,
}: {
  invoice: Invoice;
  /** 承認グループに入っていて、この段を処理できるか（サーバーが再判定する）。 */
  canAct: boolean;
  onApprove: (n: string) => Promise<ActionResult<unknown>>;
  onReject: (n: string, reason: string) => Promise<ActionResult<unknown>>;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<ActionResult<unknown>>, done: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        notifications.show({ message: done, color: "green" });
        setRejectOpen(false);
        setReason("");
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });

  // 発行前承認は DRAFT のときだけ意味を持つ。SENT なら入金前承認。
  // どちらでもない状態（approvalStatus が古い値のまま等）は何も描かない。
  const isPaymentApproval = invoice.status === "SENT";
  if (invoice.status !== "DRAFT" && invoice.status !== "SENT") return null;

  if (invoice.approvalStatus === "REJECTED") {
    return (
      <ActionCard
        description={
          invoice.rejectReason ??
          (isPaymentApproval
            ? tr("billing.invoices.paymentApprovalRejectedHelp")
            : tr("billing.invoices.issueApprovalRejectedHelp"))
        }
        icon={<IconArrowBackUp size={20} />}
        title={tr("common.sentBack")}
        tone="alert"
      />
    );
  }

  if (invoice.approvalStatus !== "PENDING") return null;

  if (!canAct) {
    return (
      <ActionCard
        description={
          isPaymentApproval
            ? tr("billing.invoices.paymentApprovalWaitingHelp")
            : tr("billing.invoices.issueApprovalWaitingHelp")
        }
        icon={<IconClock size={20} />}
        title={tr("common.pendingApproval")}
        tone="wait"
      />
    );
  }

  const manualItems = invoice.items.filter((it) => it.isManualCharge);
  const manualTotal = manualItems.reduce((sum, it) => sum + it.amount, 0);
  const description =
    isPaymentApproval || !hasManualCharge(invoice.items)
      ? tr("billing.invoices.paymentApprovalApproveHelp")
      : tr("billing.invoices.issueApprovalApproveHelpWithCharges", {
          count: manualItems.length,
          amount: formatMoney(manualTotal),
        });

  return (
    <>
      <ActionCard
        actions={
          <>
            <ApproveButton
              loading={isPending}
              onClick={() =>
                run(
                  () => onApprove(invoice.invoiceNumber),
                  tr("common.approved"),
                )
              }
            />
            <RejectButton
              disabled={isPending}
              onClick={() => setRejectOpen(true)}
            />
          </>
        }
        description={description}
        icon={<IconCheck size={20} />}
        title={tr("common.waitingForYourApproval")}
        tone="approve"
      />
      <ModalShell
        confirmColor="red"
        confirmDisabled={!reason.trim()}
        confirmLabel={tr("common.sendBack")}
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={() =>
          run(
            () => onReject(invoice.invoiceNumber, reason),
            tr("common.sentBack"),
          )
        }
        opened={rejectOpen}
        title={tr("common.reject")}
      >
        <Text mb="sm" size="sm">
          {tr("common.enterAReasonForSendingIt")}
        </Text>
        <Textarea
          autosize
          minRows={3}
          onChange={(e) => setReason(e.currentTarget.value)}
          value={reason}
          withAsterisk
        />
      </ModalShell>
    </>
  );
}
