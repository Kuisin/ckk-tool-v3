"use client";

/**
 * ApprovalStatusPanel — 指示書承認状況 (_specs/design.md §12.4)。
 *
 * Stepper（第一承認 → 第二承認）+ 状態別アクション:
 *   DRAFT: 承認依頼 / PENDING_1ST: 第一承認・差し戻し（FIRST グループ）/
 *   PENDING_2ND: 第二承認・差し戻し（SECOND グループ）。
 * REJECTED は差し戻し理由の Alert。承認記録は history Json から表示する。
 */

import {
  Alert,
  Badge,
  Divider,
  Group,
  Paper,
  Stack,
  Stepper,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconSend } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveFirst,
  approveSecond,
  rejectWorkOrder,
  requestApproval,
} from "@/app/(dashboard)/production/work-orders/actions";
import {
  ApproveButton,
  PrimaryButton,
  RejectButton,
} from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import {
  WORK_ORDER_HISTORY_ACTION_LABEL,
  type WorkOrderHistoryView,
} from "./work-orders/model";

/** approvalStatus → Stepper の active index。 */
function stepperActive(approvalStatus: string): number {
  switch (approvalStatus) {
    case "PENDING_1ST":
      return 0;
    case "APPROVED_1ST":
    case "PENDING_2ND":
      return 1;
    case "APPROVED":
      return 2;
    default:
      return -1; // NONE / REJECTED
  }
}

export function ApprovalStatusPanel({
  workOrderNumber,
  status,
  approvalStatus,
  rejectReason,
  history,
  canApproveFirst,
  canApproveSecond,
}: {
  workOrderNumber: number;
  status: string;
  approvalStatus: string;
  rejectReason: string | null;
  history: WorkOrderHistoryView[];
  canApproveFirst: boolean;
  canApproveSecond: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: done,
          message: `指示書 #${workOrderNumber}`,
          color: "green",
        });
        setRejectOpen(false);
        setReason("");
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

  const isPending1st = approvalStatus === "PENDING_1ST";
  const isPending2nd = approvalStatus === "PENDING_2ND";
  const canActHere =
    (isPending1st && canApproveFirst) || (isPending2nd && canApproveSecond);

  // 承認記録は新しい順で表示
  const records = [...history].reverse();

  return (
    <Paper p="md" radius="md" withBorder>
      <Title mb="md" order={5}>
        承認状況
      </Title>

      <Stepper active={stepperActive(approvalStatus)} size="sm">
        <Stepper.Step
          description="工場長・部長クラス"
          label="第一承認"
          loading={isPending1st}
        />
        <Stepper.Step
          description="部長クラス"
          label="第二承認"
          loading={isPending2nd}
        />
      </Stepper>

      {approvalStatus === "REJECTED" && rejectReason && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          mt="md"
          title="差し戻し"
          variant="light"
        >
          {rejectReason}
        </Alert>
      )}

      <Group gap="xs" mt="md">
        {status === "DRAFT" && (
          <PrimaryButton
            leftSection={<IconSend size={14} />}
            loading={isPending}
            onClick={() =>
              run(() => requestApproval(workOrderNumber), "承認依頼しました")
            }
          >
            {approvalStatus === "REJECTED" ? "再承認依頼" : "承認依頼"}
          </PrimaryButton>
        )}
        {canActHere && (
          <>
            <ApproveButton
              loading={isPending}
              onClick={() =>
                isPending1st
                  ? run(() => approveFirst(workOrderNumber), "第一承認しました")
                  : run(
                      () => approveSecond(workOrderNumber),
                      "第二承認しました",
                    )
              }
            >
              {isPending1st ? "第一承認" : "第二承認"}
            </ApproveButton>
            <RejectButton onClick={() => setRejectOpen(true)} />
          </>
        )}
        {(isPending1st || isPending2nd) && !canActHere && (
          <Text c="dimmed" size="xs">
            {isPending1st ? "第一" : "第二"}
            承認グループのメンバーのみ承認・差し戻しできます
          </Text>
        )}
      </Group>

      {records.length > 0 && (
        <>
          <Divider my="md" />
          <Stack gap="xs">
            {records.map((h, i) => (
              <Group gap="sm" key={`${h.at}-${h.action}-${i}`} wrap="nowrap">
                <Badge color="gray" size="sm" variant="light">
                  {WORK_ORDER_HISTORY_ACTION_LABEL[h.action] ?? h.action}
                </Badge>
                <Text size="xs">{h.user}</Text>
                <Text c="dimmed" className="tabular-nums" size="xs">
                  {formatDateTime(h.at)}
                </Text>
                {h.notes && (
                  <Text c="dimmed" size="xs" truncate>
                    {h.notes}
                  </Text>
                )}
              </Group>
            ))}
          </Stack>
        </>
      )}

      <ModalShell
        confirmColor="red"
        confirmLabel="差し戻す"
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => {
          if (!reason.trim()) {
            notifications.show({
              title: "エラー",
              message: "差し戻し理由を入力してください",
              color: "red",
            });
            return;
          }
          run(() => rejectWorkOrder(workOrderNumber, reason), "差し戻しました");
        }}
        opened={rejectOpen}
        size="sm"
        title="差し戻しの確認"
      >
        <Textarea
          autosize
          label="差し戻し理由"
          minRows={3}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder="理由を入力"
          value={reason}
          withAsterisk
        />
      </ModalShell>
    </Paper>
  );
}
