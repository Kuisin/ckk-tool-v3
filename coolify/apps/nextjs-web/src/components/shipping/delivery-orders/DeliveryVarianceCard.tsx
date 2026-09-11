"use client";

/**
 * DeliveryVarianceCard — 過不足納品の「いま何をすべきか」カード（§8, design.md §10.9）。
 *
 * 出荷書に承認が付くのは**過不足のときだけ**なので、通常の出荷では何も描かない。
 * 色は状態ではなく**ログイン中ユーザーの立場**で決まる（design.md §10.9）:
 * 承認できる = green / 待つだけ = gray / 差し戻された = red。
 *
 * 「承認を依頼する」ボタンは持たない — 依頼は「確定」を押した時点で
 * サーバー（guardVarianceOnConfirm）が必要と判断したときだけ自動で出る。
 * 押し忘れで出荷が止まる余地を作らないため、押す場所を用意しない。
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
import type { ActionResult } from "@/lib/server-action";
import type { DeliveryOrder } from "./model";

export function DeliveryVarianceCard({
  order,
  canAct,
  onApprove,
  onReject,
}: {
  order: DeliveryOrder;
  /** 承認グループに入っていて、この段を処理できるか（サーバーが再判定する）。 */
  canAct: boolean;
  onApprove: (n: string) => Promise<ActionResult>;
  onReject: (n: string, reason: string) => Promise<ActionResult>;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<ActionResult>, done: string) =>
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

  if (order.approvalStatus === "REJECTED") {
    return (
      <ActionCard
        description={
          order.rejectReason ??
          tr("shipping.deliveryOrders.varianceRejectedHelp")
        }
        icon={<IconArrowBackUp size={20} />}
        title={tr("shipping.deliveryOrders.varianceRejected")}
        tone="alert"
      />
    );
  }

  if (order.approvalStatus !== "PENDING") return null;

  if (!canAct) {
    return (
      <ActionCard
        description={tr("shipping.deliveryOrders.varianceWaitingHelp")}
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
                run(
                  () => onApprove(order.deliveryOrderNumber),
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
        description={tr("shipping.deliveryOrders.varianceApproveHelp")}
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
            () => onReject(order.deliveryOrderNumber, reason),
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
