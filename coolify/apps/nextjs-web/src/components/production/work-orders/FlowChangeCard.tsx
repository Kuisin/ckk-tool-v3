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
import { useState, useTransition } from "react";
import {
  approveFlowChange,
  rejectFlowChange,
} from "@/app/(dashboard)/production/work-orders/actions";
import { ActionCard } from "@/components/ui/ActionCard";
import { ApproveButton, RejectButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";
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
  const tr = useTr();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!change) return null;

  const canAct = approval.canAct;
  const stepLabel =
    approval.stepCount > 0
      ? `${approval.stepLabel || `第${approval.stepNo}承認`}（${approval.stepNo}/${approval.stepCount}）`
      : tr("承認依頼中");

  const handleApprove = () => {
    startTransition(async () => {
      const result = await approveFlowChange(change.id);
      if (result.ok) {
        notifications.show({
          title: result.data?.applied
            ? change.appliedAt != null
              ? tr("工程フロー変更を承認しました（適用済み）")
              : tr("工程フロー変更を適用しました")
            : tr("承認しました"),
          message: result.data?.applied
            ? change.summary
            : tr("次の承認者へ回りました"),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: result.error ?? tr("承認に失敗しました"),
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
          title: tr("差し戻しました"),
          message:
            change.appliedAt != null
              ? tr(
                  tr(
                    tr(
                      "変更は適用済みです — 工程は自動では戻りません（詳細に警告が出ます）",
                    ),
                  ),
                )
              : tr("工程は変更されていません"),
          color: "orange",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: result.error ?? tr("差し戻しに失敗しました"),
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
        description={tr("{summary}｜依頼: {v1}｜{stepLabel}。{v3}", {
          summary: change.summary,
          v1: change.requestedByName ?? "—",
          stepLabel: stepLabel,
          v3:
            change.appliedAt != null
              ? "適用済みです（事後承認 — 差し戻されても自動では戻りません）。"
              : "承認されるまで工程は変わりません。",
        })}
        icon={<IconGitBranch size={20} />}
        title={
          canAct ? "工程フロー変更の承認" : tr("工程フロー変更の承認依頼中")
        }
        tone={canAct ? "approve" : "wait"}
      />
      <ModalShell
        confirmColor="red"
        confirmDisabled={!reason.trim()}
        confirmLabel={tr("差し戻す")}
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        opened={rejectOpen}
        title={tr("工程フロー変更の差し戻し")}
      >
        <Text size="sm">
          {tr(
            tr(
              tr(
                "差し戻すと、この変更は適用されずに閉じます（工程はいまのままです）。",
              ),
            ),
          )}
        </Text>
        <textarea
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder={tr("差し戻し理由")}
          rows={3}
          style={{ width: "100%" }}
          value={reason}
        />
      </ModalShell>
    </>
  );
}
