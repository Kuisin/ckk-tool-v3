"use client";

/**
 * FlowChangeCard — 承認依頼中の工程フロー変更（_specs/design.md §10.9 ActionCard）。
 *
 * 承認済み・進行中の指示書で分岐を足す/直す/消すと、承認設定（MS0B）に
 * 「工程フロー変更」の段があるあいだは**工程を触らずここに保留**される。
 * 最終承認で初めて適用され、差し戻しなら適用されずに閉じる。
 * 承認設定が 1 段も無い環境ではそもそもこのカードは出ない（即適用のため）。
 *
 * 色は §10.9 の tone に従う — 自分が承認できるなら green、待つだけなら gray。
 */

import { Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconGitBranch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  approveFlowChange,
  rejectFlowChange,
} from "@/app/(dashboard)/production/work-orders/actions";
import { ActionCard } from "@/components/ui/ActionCard";
import { ApproveButton, RejectButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import type { ApprovalActionState } from "@/lib/approvals";

export interface PendingFlowChangeView {
  id: string;
  kind: string;
  summary: string;
  requestedByName: string | null;
  requestedAt: string;
  /** 事後承認（POST）で即時適用済みの日時（PRE = 承認後に適用 は null）。 */
  appliedAt: string | null;
}

export function FlowChangeCard({
  change,
  approval,
}: {
  change: PendingFlowChangeView | null;
  /** 変更そのものの承認状態（work_order_flow_changes の依頼）。 */
  approval: ApprovalActionState;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!change) return null;

  const canAct = approval.canAct;
  const stepLabel =
    approval.stepCount > 0
      ? `${approval.stepLabel || `第${approval.stepNo}承認`}（${approval.stepNo}/${approval.stepCount}）`
      : tr("common.pendingApproval");

  const handleApprove = () => {
    startTransition(async () => {
      const result = await approveFlowChange(change.id);
      if (result.ok) {
        notifications.show({
          title: result.data?.applied
            ? change.appliedAt != null
              ? tr("production.workOrders.theWorkflowChangeWasApprovedAnd")
              : tr("production.workOrders.theWorkflowChangeWasApplied")
            : tr("common.approved"),
          message: result.data?.applied
            ? change.summary
            : tr("common.passedToTheNextApprover"),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error ?? tr("common.couldNotApprove"),
          color: "red",
        });
      }
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      const result = await rejectFlowChange(change.id, reason);
      if (result.ok) {
        setRejectOpen(false);
        setReason("");
        notifications.show({
          title: tr("common.sentBack"),
          message:
            change.appliedAt != null
              ? tr("production.workOrders.theChangeIsAlreadyAppliedThe")
              : tr("production.workOrders.theStepsHaveNotChanged"),
          color: "orange",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error ?? tr("common.couldNotSendItBack"),
          color: "red",
        });
      }
    });
  };

  return (
    <>
      <ActionCard
        actions={
          canAct ? (
            <>
              <RejectButton
                disabled={isPending}
                onClick={() => setRejectOpen(true)}
              />
              <ApproveButton loading={isPending} onClick={handleApprove} />
            </>
          ) : null
        }
        description={`${change.summary}｜依頼: ${change.requestedByName ?? "—"}｜${stepLabel}。${
          change.appliedAt != null
            ? "適用済みです（事後承認 — 差し戻されても自動では戻りません）。"
            : "承認されるまで工程は変わりません。"
        }`}
        icon={<IconGitBranch size={20} />}
        title={
          canAct
            ? "工程フロー変更の承認"
            : tr("production.workOrders.workflowChangePendingApproval")
        }
        tone={canAct ? "approve" : "wait"}
      />
      <ModalShell
        confirmColor="red"
        confirmDisabled={!reason.trim()}
        confirmLabel={tr("common.sendBack")}
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        opened={rejectOpen}
        title={tr("production.workOrders.sendTheWorkflowChangeBack")}
      >
        <Text size="sm">
          {tr("production.workOrders.sendingItBackClosesTheChange")}
        </Text>
        <textarea
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder={tr("common.reasonForSendingBack")}
          rows={3}
          style={{ width: "100%" }}
          value={reason}
        />
      </ModalShell>
    </>
  );
}
