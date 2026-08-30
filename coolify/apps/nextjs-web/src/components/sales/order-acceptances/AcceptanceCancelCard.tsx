"use client";

/**
 * AcceptanceCancelCard — 承認依頼中の注文請書キャンセル依頼
 * （_specs/design.md §10.9 ActionCard）。
 *
 * 確定済みの注文請書のキャンセルは、承認設定（MS0B）に「注文請書キャンセル」
 * の段があるあいだ**何も変えずここに保留**される。最終承認で初めて適用され
 * （全明細キャンセル + ヘッダ CANCELLED）、差し戻しなら何も変わらない。
 * 承認設定が 1 段も無い環境ではそもそもこのカードは出ない（即適用のため）。
 *
 * 色は §10.9 の tone に従う — 自分が承認できるなら green、待つだけなら gray。
 */

import { Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveAcceptanceCancel,
  rejectAcceptanceCancel,
} from "@/app/(dashboard)/sales/order-acceptances/actions";
import { ActionCard } from "@/components/ui/ActionCard";
import { ApproveButton, RejectButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import type { ApprovalActionState } from "@/lib/approvals";
import type { PendingAcceptanceCancelView } from "@/lib/order-acceptance-cancel";

export function AcceptanceCancelCard({
  request,
  approval,
}: {
  request: PendingAcceptanceCancelView | null;
  /** 依頼そのものの承認状態（order_acceptance_cancel_requests の依頼）。 */
  approval: ApprovalActionState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!request) return null;

  const canAct = approval.canAct;
  const stepLabel =
    approval.stepCount > 0
      ? `${approval.stepLabel || `第${approval.stepNo}承認`}（${approval.stepNo}/${approval.stepCount}）`
      : "承認依頼中";

  const handleApprove = () => {
    startTransition(async () => {
      const result = await approveAcceptanceCancel(request.id);
      if (result.ok) {
        notifications.show({
          title: result.data?.applied
            ? "注文請書をキャンセルしました"
            : "承認しました",
          message: result.data?.applied
            ? "全明細をキャンセルしました（予約解放・未着手指示書の連鎖キャンセル含む）"
            : "次の承認者へ回りました",
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error ?? "承認に失敗しました",
          color: "red",
        });
      }
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      const result = await rejectAcceptanceCancel(request.id, reason);
      if (result.ok) {
        setRejectOpen(false);
        setReason("");
        notifications.show({
          title: "差し戻しました",
          message: "注文請書は変更されていません",
          color: "orange",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error ?? "差し戻しに失敗しました",
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
        description={`理由: ${request.reason}｜依頼: ${request.requestedByName ?? "—"}｜${stepLabel}。承認されるまで注文請書と注文明細は変わりません。`}
        icon={<IconX size={20} />}
        title={
          canAct ? "注文請書キャンセルの承認" : "注文請書キャンセルの承認依頼中"
        }
        tone={canAct ? "approve" : "wait"}
      />
      <ModalShell
        confirmColor="red"
        confirmDisabled={!reason.trim()}
        confirmLabel="差し戻す"
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        opened={rejectOpen}
        title="キャンセル依頼の差し戻し"
      >
        <Text size="sm">
          差し戻すと、この依頼は適用されずに閉じます（注文請書はいまのままです）。
        </Text>
        <Textarea
          minRows={3}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder="差し戻し理由"
          value={reason}
        />
      </ModalShell>
    </>
  );
}
