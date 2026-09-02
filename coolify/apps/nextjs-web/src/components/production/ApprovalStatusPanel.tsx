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
import { useTranslations } from "next-intl";
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
  type HandoffGroup,
  ProcedurePanel,
  type ProcedureStage,
} from "@/components/ui/ProcedurePanel";
import { statusLabel } from "@/lib/status-map";
import {
  WORK_ORDER_HISTORY_ACTION_LABEL,
  type WorkOrderHistoryView,
  type WorkOrderView,
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
  const tr = useTranslations();
  return (
    <ApprovalActionCard
      approval={approval}
      canRequest={status === "DRAFT"}
      onApprove={() => approveWorkOrder(workOrderNumber)}
      onReject={(reason) => rejectWorkOrder(workOrderNumber, reason)}
      onRequest={() => requestApproval(workOrderNumber)}
      rejectReason={rejectReason}
      subject={tr("production.approvalStatusPanel.workOrderSubject", {
        number: workOrderNumber,
      })}
    />
  );
}

/**
 * WorkOrderProcedurePanel — 指示書の手続き状況（作成 → 承認段 → 製造 → 完了）。
 *
 * 旧 承認状況（承認段だけの Stepper）を全ライフサイクルへ広げたもの。承認段は
 * 依頼時スナップショット（approval.steps）由来で、承認記録・操作履歴も
 * 従来どおりパネル内に出す。「次の書類へ」で出荷書（ロット単位）と
 * 後続指示書（work_order_links）への受け渡しを追跡する。
 */
export function WorkOrderProcedurePanel({
  workOrder,
  approval,
  rejectReason,
  history,
  trail = [],
}: {
  workOrder: WorkOrderView;
  approval: ApprovalActionState;
  rejectReason: string | null;
  history: WorkOrderHistoryView[];
  trail?: ApprovalTrailView[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const wo = workOrder;
  const records = [...history].reverse();

  // ── 段の組み立て: 作成 → 承認段（スナップショット）→ 製造 → 完了 ──────────
  const approvalSteps =
    approval.steps.length > 0
      ? approval.steps
      : [
          {
            stepNo: 1,
            label: tr("common.approve"),
            groupLabel: "",
            mode: "ANY" as const,
          },
        ];
  const n = approvalSteps.length;
  const rejected = approval.phase === "REJECTED";

  const stages: ProcedureStage[] = [
    {
      key: "created",
      label: tr("common.create2"),
      description: fmt.date(wo.createdAt),
    },
    ...approvalSteps.map((s, i) => ({
      key: `approval-${s.stepNo}`,
      label:
        s.label ||
        tr("production.approvalStatusPanel.stepNumberApproval", {
          step: s.stepNo,
        }),
      description:
        rejected && s.stepNo === approval.stepNo
          ? tr("common.reject")
          : i === n - 1 && wo.approvedAt && wo.status !== "DRAFT"
            ? fmt.date(wo.approvedAt)
            : s.groupLabel
              ? s.mode === "ALL"
                ? tr("production.approvalStatusPanel.allMembersApproval", {
                    group: s.groupLabel,
                  })
                : s.groupLabel
              : null,
      color: rejected && s.stepNo === approval.stepNo ? "red" : undefined,
    })),
    {
      key: "production",
      label: tr("common.manufacture"),
      description: wo.startedAt
        ? tr("production.approvalStatusPanel.startedOn", {
            date: fmt.date(wo.startedAt),
          })
        : wo.status === "APPROVED"
          ? tr("production.approvalStatusPanel.awaitingStart")
          : null,
      loading: wo.status === "IN_PROGRESS",
    },
    {
      key: "done",
      label: tr("common.completed"),
      description: wo.completedAt ? fmt.date(wo.completedAt) : null,
    },
  ];

  const active = (() => {
    switch (wo.status) {
      case "DRAFT":
        // 差し戻しは止まっている段、依頼前は先頭の承認段が現在
        return 1 + (rejected ? approval.stepNo - 1 : 0);
      case "PENDING_APPROVAL":
        return 1 + (approval.stepNo - 1);
      case "APPROVED":
      case "IN_PROGRESS":
        return 1 + n;
      case "COMPLETED":
        return stages.length;
      default:
        // CANCELLED — 進んだところまで（開始済み > 承認済み > 依頼済み > 作成）
        return wo.startedAt ? 1 + n : wo.approvedAt ? 1 + n : 1;
    }
  })();

  // ── 前の書類から: 割り当てられた注文明細 + 前段の指示書 ──────────────────
  // 割当ゼロ = 在庫向けの独立指示書（_specs/tables.md work_order_order_lines）。
  const allocated = wo.orderLines.reduce(
    (sum, l) => sum + l.allocatedQuantity,
    0,
  );
  const sourceGroups: HandoffGroup[] = [
    {
      key: "order-lines",
      title: tr("common.orderLinesAllocated"),
      summary:
        wo.orderLines.length > 0
          ? tr("production.approvalStatusPanel.allocatedVsPlanned", {
              allocated,
              planned: wo.plannedQuantity,
            })
          : null,
      items: wo.orderLines.map((l) => ({
        key: l.orderLineId,
        label: l.number,
        href: `/sales/order-lines/${l.number}`,
        note: tr("production.approvalStatusPanel.customerAllocatedOfOrdered", {
          customer: l.customerName ?? "—",
          allocated: l.allocatedQuantity,
          ordered: l.lineQuantity,
        }),
      })),
      emptyNote: tr(
        "production.approvalStatusPanel.noAllocationStandaloneWorkOrderFor",
      ),
    },
    ...(wo.woLinksIncoming.length > 0
      ? [
          {
            key: "wo-links-in",
            title: tr(
              "production.approvalStatusPanel.precedingWorkOrderQuantityHandover",
            ),
            items: wo.woLinksIncoming.map((l) => ({
              key: l.id,
              label: l.docNumber,
              href: `/production/work-orders/${l.workOrderNumber}`,
              note: tr("production.approvalStatusPanel.receivedQuantity", {
                quantity:
                  l.quantity != null
                    ? tr("production.approvalStatusPanel.nPcs", {
                        quantity: l.quantity,
                      })
                    : tr(
                        "production.approvalStatusPanel.fullCompletedQuantity",
                      ),
              }),
            })),
            emptyNote: "—",
          },
        ]
      : []),
  ];

  // ── 次の書類へ: 出荷書（ロット単位）+ 後続指示書 ────────────────────────────
  const shippedToDo = wo.shipments.reduce((sum, s) => sum + s.quantity, 0);
  const handoffGroups: HandoffGroup[] = [
    {
      key: "delivery-orders",
      title: tr("common.deliveryOrder"),
      summary:
        wo.shipments.length > 0
          ? tr("production.approvalStatusPanel.allocatedVsPlanned", {
              allocated: shippedToDo,
              planned: wo.plannedQuantity,
            })
          : null,
      items: wo.shipments.map((s, i) => ({
        key: `${s.number}-${i}`,
        label: s.number,
        href: `/shipping/delivery-orders/${s.number}`,
        done: s.status === "SHIPPED",
        note: tr("production.approvalStatusPanel.deliveryStatusQuantity", {
          status: statusLabel("DeliveryOrder", s.status),
          quantity: s.quantity,
          stockNote:
            s.type === "STOCK_STORAGE"
              ? tr("production.approvalStatusPanel.stockStorageNote")
              : "",
        }),
      })),
      emptyNote:
        wo.status === "COMPLETED"
          ? tr("production.approvalStatusPanel.nothingIsAllocatedToADelivery")
          : tr(
              "production.approvalStatusPanel.unallocatedAllocatedOnADeliveryOrder",
            ),
    },
    ...(wo.woLinksOutgoing.length > 0
      ? [
          {
            key: "wo-links",
            title: tr(
              "production.approvalStatusPanel.followingWorkOrderQuantityHandover",
            ),
            summary: null,
            items: wo.woLinksOutgoing.map((l) => ({
              key: l.id,
              label: l.docNumber,
              href: `/production/work-orders/${l.workOrderNumber}`,
              done: wo.status === "COMPLETED",
              note: tr("production.approvalStatusPanel.handedOverQuantity", {
                quantity:
                  l.quantity != null
                    ? tr("production.approvalStatusPanel.nPcs", {
                        quantity: l.quantity,
                      })
                    : tr(
                        "production.approvalStatusPanel.fullCompletedQuantity",
                      ),
              }),
            })),
            emptyNote: "—",
          },
        ]
      : []),
  ];

  return (
    <ProcedurePanel
      active={active}
      cancelled={wo.status === "CANCELLED"}
      handoffGroups={handoffGroups}
      sourceGroups={sourceGroups}
      stages={stages}
    >
      {rejected && rejectReason && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          mt="md"
          title={tr("common.reject")}
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
    </ProcedurePanel>
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
  const tr = useTranslations();
  const fmt = useFormat();
  // 操作履歴は新しい順で表示
  const records = [...history].reverse();

  return (
    <Paper p="md" radius="md" withBorder>
      <Title mb="md" order={5}>
        {tr("production.approvalStatusPanel.approvalStatus")}
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
          title={tr("common.reject")}
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
