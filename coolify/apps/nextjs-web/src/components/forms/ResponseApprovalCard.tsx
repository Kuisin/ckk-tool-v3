"use client";

/**
 * ResponseApprovalCard — フォーム申請の「いま何をすべきか」カード。
 *
 * 指示書の WorkOrderApprovalCard は指示書専用なので、フォーム用に同じ考え方で
 * 作る。**色は状態ではなくログイン中ユーザーの立場で決まる**（design.md §10.9）:
 * 自分で進められる = blue / 承認できる = green / 待つだけ = gray / 差し戻し = red。
 */

import { Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconSend,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionCard } from "@/components/ui/ActionCard";
import {
  ApproveButton,
  PrimaryButton,
  RejectButton,
} from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";

export function ResponseApprovalCard({
  responseNumber,
  status,
  rejectReason,
  isOwner,
  canAct,
  onRequest,
  onApprove,
  onReject,
}: {
  responseNumber: string;
  status: string;
  rejectReason: string | null;
  isOwner: boolean;
  /** 承認グループに入っていて、この段を処理できるか。 */
  canAct: boolean;
  onRequest: (n: string) => Promise<{ ok: boolean; error?: string }>;
  onApprove: (n: string) => Promise<{ ok: boolean; error?: string }>;
  onReject: (
    n: string,
    reason: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
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
          title: "エラー",
          message: result.error ?? "処理に失敗しました",
          color: "red",
        });
      }
    });

  if (status === "SUBMITTED" && isOwner) {
    return (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconSend size={14} />}
            loading={isPending}
            onClick={() =>
              run(() => onRequest(responseNumber), "承認を依頼しました")
            }
          >
            承認依頼
          </PrimaryButton>
        }
        description="内容を確認したら承認を依頼してください。"
        icon={<IconSend size={20} />}
        title="承認依頼ができます"
        tone="action"
      />
    );
  }

  if (status === "REJECTED" && isOwner) {
    return (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconSend size={14} />}
            loading={isPending}
            onClick={() =>
              run(() => onRequest(responseNumber), "承認を再依頼しました")
            }
          >
            再依頼
          </PrimaryButton>
        }
        description={
          rejectReason
            ? `理由: ${rejectReason}`
            : "内容を直して再依頼してください。"
        }
        icon={<IconAlertTriangle size={20} />}
        title="差し戻されています"
        tone="alert"
      />
    );
  }

  if (status === "REQUESTED") {
    if (!canAct) {
      return (
        <ActionCard
          description="承認者の対応を待っています。"
          icon={<IconClock size={20} />}
          title="承認待ち"
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
                  run(() => onApprove(responseNumber), "承認しました")
                }
              />
              <RejectButton
                disabled={isPending}
                onClick={() => setRejectOpen(true)}
              />
            </>
          }
          description="内容を確認して承認または差し戻してください。"
          icon={<IconCheck size={20} />}
          title="あなたの承認待ちです"
          tone="approve"
        />
        <ModalShell
          confirmColor="red"
          confirmDisabled={!reason.trim()}
          confirmLabel="差し戻す"
          loading={isPending}
          onClose={() => setRejectOpen(false)}
          onConfirm={() =>
            run(() => onReject(responseNumber, reason), "差し戻しました")
          }
          opened={rejectOpen}
          title="差し戻し"
        >
          <Text mb="sm" size="sm">
            差し戻す理由を入力してください（申請者に表示されます）。
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
