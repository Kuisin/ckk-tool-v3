"use client";

/**
 * ResponseApprovalCard — フォーム申請の「いま何をすべきか」カード。
 *
 * 指示書の WorkOrderApprovalCard は指示書専用なので、フォーム用に同じ考え方で
 * 作る。**色は状態ではなくログイン中ユーザーの立場で決まる**（design.md §10.9）:
 * 承認できる = green / 待つだけ = gray。
 *
 * **回答者向けの「承認依頼」ボタンは持たない。** 提出そのものが申請になり
 * （actions.ts の autoRequestApproval）、差し戻しは内容を直して保存し直せば
 * 再依頼される。押し忘れで申請が滞留する余地を無くすため、押す場所を作らない。
 * 差し戻された事実と理由は ResponseDetail の Alert が伝える。
 */

import { Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconClock } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ActionCard } from "@/components/ui/ActionCard";
import { ApproveButton, RejectButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";

export function ResponseApprovalCard({
  responseNumber,
  status,
  canAct,
  onApprove,
  onReject,
}: {
  responseNumber: string;
  status: string;
  /** 承認グループに入っていて、この段を処理できるか。 */
  canAct: boolean;
  onApprove: (n: string) => Promise<{ ok: boolean; error?: string }>;
  onReject: (
    n: string,
    reason: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done: string,
  ) =>
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
          message: result.error ?? tr("common.theOperationFailed"),
          color: "red",
        });
      }
    });

  if (status === "REQUESTED") {
    if (!canAct) {
      return (
        <ActionCard
          description={tr("forms.responseApprovalCard.waitingForTheApprover")}
          icon={<IconClock size={20} />}
          title={tr("common.pendingApproval")}
          tone="wait"
        />
      );
    }
    return (
      <>
        <ActionCard
          actions={
            <>
              <ApproveButton
                loading={isPending}
                onClick={() =>
                  run(() => onApprove(responseNumber), tr("common.approved"))
                }
              />
              <RejectButton
                disabled={isPending}
                onClick={() => setRejectOpen(true)}
              />
            </>
          }
          description={tr("common.reviewItAndEitherApproveOr")}
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
            run(() => onReject(responseNumber, reason), tr("common.sentBack"))
          }
          opened={rejectOpen}
          title="差し戻し"
        >
          <Text mb="sm" size="sm">
            {tr("forms.responseApprovalCard.enterAReasonForSendingIt")}
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

  return null;
}
