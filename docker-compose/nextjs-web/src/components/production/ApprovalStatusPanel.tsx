"use client";

/**
 * ApprovalStatusPanel — 指示書承認状況 (_specs/design.md §12.4)。
 *
 * このファイルは 2 つのコンポーネントを出す:
 *
 *   WorkOrderApprovalCard — 画面最上部の「いまやること」カード。指示書の
 *     Server Action を共通の ApprovalActionCard に束ねるだけの薄い層。
 *   ApprovalStatusPanel — Stepper（フローの全段）と記録の表示のみ。操作履歴は
 *     history Json から、正規化された承認記録（approval_records — 代理承認は
 *     「（代理: 原承認者）」付き）は trail prop から表示する。
 *
 * 段数は承認設定 (MS0B) が書類種別ごとに決めるので、ここには第一/第二といった
 * 固定の段は無い。表示はすべて依頼時のスナップショット由来。
 */

import {
  Alert,
  Badge,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import {
  approveWorkOrder,
  rejectWorkOrder,
  requestApproval,
} from "@/app/(dashboard)/production/work-orders/actions";
import {
  ApprovalActionCard,
  type ApprovalActionState,
} from "@/components/approvals/ApprovalActionCard";
import { ApprovalStepper } from "@/components/approvals/ApprovalStepper";
import {
  ApprovalTrailList,
  type ApprovalTrailView,
  countTrailRecords,
} from "@/components/approvals/ApprovalTrailList";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  WORK_ORDER_HISTORY_ACTION_LABEL,
  type WorkOrderHistoryView,
} from "./work-orders/model";

export type {
  ApprovalTrailRecordView,
  ApprovalTrailView,
} from "@/components/approvals/ApprovalTrailList";
// 承認記録の型・一覧は components/approvals に移した。指示書以外の書類からも
// 使うため。ここでは指示書側の import 元を 1 つに保つために再輸出する。
export {
  ApprovalTrailList,
  countTrailRecords,
} from "@/components/approvals/ApprovalTrailList";

/**
 * WorkOrderApprovalCard — 指示書の「いまやること」カード（画面最上部）。
 * 承認依頼 / 承認 / 差し戻しの操作を共通カードに渡す。
 */
export function WorkOrderApprovalCard({
  workOrderNumber,
  status,
  approval,
  rejectReason,
}: {
  workOrderNumber: number;
  status: string;
  approval: ApprovalActionState;
  rejectReason: string | null;
}) {
  return (
    <ApprovalActionCard
      approval={approval}
      canRequest={status === "DRAFT"}
      onApprove={() => approveWorkOrder(workOrderNumber)}
      onReject={(reason) => rejectWorkOrder(workOrderNumber, reason)}
      onRequest={() => requestApproval(workOrderNumber)}
      rejectReason={rejectReason}
      subject={`指示書 #${workOrderNumber}`}
    />
  );
}

/**
 * ApprovalStatusPanel — 承認フローの表示のみ（Stepper + 承認記録 + 操作履歴）。
 * 操作ボタンは WorkOrderApprovalCard が持つ。
 */
export function ApprovalStatusPanel({
  approval,
  rejectReason,
  history,
  trail = [],
}: {
  approval: ApprovalActionState;
  rejectReason: string | null;
  history: WorkOrderHistoryView[];
  /** 正規化された承認記録（fetchApprovalTrail の結果）。 */
  trail?: ApprovalTrailView[];
}) {
  const fmt = useFormat();
  // 操作履歴は新しい順で表示
  const records = [...history].reverse();

  return (
    <Paper p="md" radius="md" withBorder>
      <Title mb="md" order={5}>
        承認状況
      </Title>

      <ApprovalStepper
        currentStepNo={approval.stepNo}
        phase={approval.phase}
        steps={approval.steps}
      />

      {approval.phase === "REJECTED" && rejectReason && (
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
                  {fmt.dateTime(h.at)}
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
