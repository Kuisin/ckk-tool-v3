"use client";

/**
 * ApprovalStatusPanel — 指示書承認状況 (_specs/design.md §12.4)。
 *
 * このファイルは 2 つのコンポーネントを出す:
 *
 *   WorkOrderApprovalCard — 画面最上部の「いまやること」カード。状態別の操作
 *     （DRAFT: 承認依頼 / PENDING_1ST: 第一承認・差し戻し（FIRST グループ）/
 *     PENDING_2ND: 第二承認・差し戻し（SECOND グループ））を持つ。承認待ちの
 *     色は承認権限で変わる — 権限あり = 緑、権限なし = グレーの「承認待ち」。
 *   ApprovalStatusPanel — Stepper（第一承認 → 第二承認）と記録の表示のみ。
 *     操作履歴は history Json から、正規化された承認記録（approval_records —
 *     代理承認は「（代理: 原承認者）」付き）は trail prop から表示する。
 *
 * 以前は操作ボタンが Stepper の下にあり見落とされやすかったので、操作だけを
 * 最上部のカードへ切り出している。
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
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconClock,
  IconSend,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import {
  approveFirst,
  approveSecond,
  rejectWorkOrder,
  requestApproval,
} from "@/app/(dashboard)/production/work-orders/actions";
import { ActionCard } from "@/components/ui/ActionCard";
import {
  ApproveButton,
  PrimaryButton,
  RejectButton,
} from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { ModalShell } from "@/components/ui/modals";
import { fieldHelp } from "@/lib/field-help";
import { formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import {
  WORK_ORDER_HISTORY_ACTION_LABEL,
  type WorkOrderHistoryView,
} from "./work-orders/model";

// ── 承認記録（approval_requests / approval_records — client-safe view） ──────

/** 承認記録 1 件（lib/approvals fetchApprovalTrail の records と同形）。 */
export interface ApprovalTrailRecordView {
  approver: string;
  /** 代理承認の場合の原承認者名。 */
  delegateFor: string | null;
  action: string; // APPROVED | REJECTED
  comment: string | null;
  actedAt: string;
}

/** 承認依頼 1 件（step 単位）+ 記録。 */
export interface ApprovalTrailView {
  step: "FIRST" | "SECOND";
  status: string; // PENDING | APPROVED | REJECTED
  requestedAt: string;
  records: ApprovalTrailRecordView[];
}

const TRAIL_STEP_LABEL: Record<string, string> = {
  FIRST: "第一承認",
  SECOND: "第二承認",
};

const TRAIL_ACTION_LABEL: Record<string, string> = {
  APPROVED: "承認",
  REJECTED: "差し戻し",
};

/** trail 内の総記録数（表示要否の判定用）。 */
export function countTrailRecords(trail: ApprovalTrailView[]): number {
  return trail.reduce((n, t) => n + t.records.length, 0);
}

/**
 * 承認記録リスト — 段バッジ + 承認/差し戻しバッジ + 承認者
 * （代理は「（代理: 原承認者）」）+ コメント + 日時。新しい順。
 * 指示書 (ApprovalStatusPanel) と素材発注書 (PurchaseOrderDetail) で共用する。
 */
export function ApprovalTrailList({ trail }: { trail: ApprovalTrailView[] }) {
  const records = trail
    .flatMap((req) =>
      req.records.map((rec, i) => ({
        key: `${req.step}-${rec.actedAt}-${i}`,
        step: req.step,
        ...rec,
      })),
    )
    .sort((a, b) => (a.actedAt < b.actedAt ? 1 : -1));
  if (records.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text c="dimmed" fw={600} size="xs">
        承認記録
      </Text>
      {records.map((r) => (
        <Group gap="sm" key={r.key} wrap="nowrap">
          <Badge color="gray" size="sm" variant="outline">
            {TRAIL_STEP_LABEL[r.step] ?? r.step}
          </Badge>
          <Badge
            color={r.action === "APPROVED" ? "green" : "red"}
            size="sm"
            variant="light"
          >
            {TRAIL_ACTION_LABEL[r.action] ?? r.action}
          </Badge>
          <Text size="xs">
            {r.approver}
            {r.delegateFor && (
              <Text c="dimmed" component="span" size="xs">
                （代理: {r.delegateFor}）
              </Text>
            )}
          </Text>
          <Text c="dimmed" className="tabular-nums" size="xs">
            {formatDateTime(r.actedAt)}
          </Text>
          {r.comment && (
            <Text c="dimmed" size="xs" truncate>
              {r.comment}
            </Text>
          )}
        </Group>
      ))}
    </Stack>
  );
}

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

/**
 * WorkOrderApprovalCard — 指示書の「いまやること」カード（画面最上部）。
 * 承認依頼 / 第一・第二承認 / 差し戻しの操作と差し戻しモーダルを持つ。
 * 承認待ちの色は承認権限で変わる（権限なし = グレーの「承認待ち」）。
 */
export function WorkOrderApprovalCard({
  workOrderNumber,
  status,
  approvalStatus,
  rejectReason,
  canApproveFirst,
  canApproveSecond,
}: {
  workOrderNumber: number;
  status: string;
  approvalStatus: string;
  rejectReason: string | null;
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
  const isRejected = approvalStatus === "REJECTED";
  const stepLabel = isPending1st ? "第一" : "第二";

  let card: ReactNode = null;
  if (status === "DRAFT") {
    card = (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconSend size={14} />}
            loading={isPending}
            onClick={() =>
              run(() => requestApproval(workOrderNumber), "承認依頼しました")
            }
          >
            {isRejected ? "再承認依頼" : "承認依頼"}
          </PrimaryButton>
        }
        description={
          isRejected
            ? `差し戻し理由: ${rejectReason ?? "—"}（修正して再依頼できます）`
            : "第一承認グループへ承認を依頼します"
        }
        icon={
          isRejected ? <IconArrowBackUp size={20} /> : <IconSend size={20} />
        }
        title={isRejected ? "差し戻されました" : "承認依頼が必要です"}
        tone={isRejected ? "alert" : "action"}
      />
    );
  } else if (isPending1st || isPending2nd) {
    card = canActHere ? (
      <ActionCard
        actions={
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
              {stepLabel}承認
            </ApproveButton>
            <RejectButton onClick={() => setRejectOpen(true)} />
          </>
        }
        description={`${stepLabel}承認グループの承認者としてこの指示書を承認できます`}
        icon={<IconShieldCheck size={20} />}
        title="承認してください"
        tone="approve"
      />
    ) : (
      <ActionCard
        description={`${stepLabel}承認グループのメンバーのみ承認・差し戻しできます`}
        icon={<IconClock size={20} />}
        title={`${stepLabel}承認待ち`}
        tone="wait"
      />
    );
  }

  if (!card) return null;

  return (
    <>
      {card}
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
          label={<HelpLabel {...fieldHelp("approval", "rejectReason")} />}
          minRows={3}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder="理由を入力"
          value={reason}
          withAsterisk
        />
      </ModalShell>
    </>
  );
}

/**
 * ApprovalStatusPanel — 承認フローの表示のみ（Stepper + 承認記録 + 操作履歴）。
 * 操作ボタンは WorkOrderApprovalCard が持つ。
 */
export function ApprovalStatusPanel({
  approvalStatus,
  rejectReason,
  history,
  trail = [],
}: {
  approvalStatus: string;
  rejectReason: string | null;
  history: WorkOrderHistoryView[];
  /** 正規化された承認記録（fetchApprovalTrail の結果）。 */
  trail?: ApprovalTrailView[];
}) {
  const isPending1st = approvalStatus === "PENDING_1ST";
  const isPending2nd = approvalStatus === "PENDING_2ND";

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

      {countTrailRecords(trail) > 0 && (
        <>
          <Divider my="md" />
          <ApprovalTrailList trail={trail} />
        </>
      )}

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
    </Paper>
  );
}
