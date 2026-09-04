"use client";

/**
 * PurchaseOrderDetail — 素材発注書 詳細 (PU22, design.md §8.2)。
 *
 * 最上部の ActionCard（いまやること — 権限で色が変わる）+ SummaryGrid +
 * 手続き状況（ProcedurePanel — 依頼→承認→発注→入荷完了、購買依頼 ← / 素材入荷 →）
 * + Tabs（明細 / 概要 / 履歴）。
 *
 * 状態別アクション:
 *   DRAFT: 承認依頼 + 編集 / キャンセル
 *   REQUESTED: 承認（isApprover("FIRST") ゲート）/ 差し戻し（理由必須 → DRAFT）
 *   APPROVED: 発注（→ ORDERED — 明細が素材 ATP の入荷予定に反映）/ キャンセル
 *   ORDERED: 入荷完了（明細ごとに全量入荷の MaterialReceipt を作成し在庫入庫）
 */

import {
  Badge,
  Divider,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPackageImport, IconTruck, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  completePurchaseOrder,
  orderPurchaseOrder,
  rejectPurchaseOrder,
  requestPurchaseApproval,
} from "@/app/(dashboard)/purchase/purchase-orders/actions";
import {
  ApprovalActionCard,
  type ApprovalActionState,
} from "@/components/approvals/ApprovalActionCard";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  ApprovalTrailList,
  type ApprovalTrailView,
  countTrailRecords,
} from "@/components/production/ApprovalStatusPanel";
import type { MaterialReceiptView } from "@/components/purchase/material-receipts/model";
import { ActionCard } from "@/components/ui/ActionCard";
import { AppTabs } from "@/components/ui/AppTabs";
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@/components/ui/AttachmentsPanel";
import { ApproveButton, PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import {
  approvalStage,
  type HandoffGroup,
  ProcedurePanel,
  procedureStages,
} from "@/components/ui/ProcedurePanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import type { ActionResult } from "@/lib/server-action";
import {
  canAttachEvidence,
  isCancellable,
  isEditable,
  type PurchaseOrderView,
} from "./model";

const BASE_PATH = "/purchase/purchase-orders";

/**
 * status → いま留まっている段（依頼 / 承認 / 発注 / 入荷完了）。
 * キャンセルは**進んだところまで**を返す（残りは skipped で描く）。
 */
function currentStage(po: {
  status: string;
  requestedAt: string | null;
  approvedAt: string | null;
  orderedAt: string | null;
}): number {
  switch (po.status) {
    case "DRAFT":
      return 0;
    case "REQUESTED":
      return 1;
    case "APPROVED":
      return 2;
    case "ORDERED":
      return 3;
    case "COMPLETED":
      return 4;
    default:
      // CANCELLED
      if (po.orderedAt) return 3;
      if (po.approvedAt) return 2;
      if (po.requestedAt) return 1;
      return 0;
  }
}

export function PurchaseOrderDetail({
  purchaseOrder,
  auditEntries,
  approval,
  attachments,
  approvalTrail = [],
  receipts = [],
}: {
  purchaseOrder: PurchaseOrderView;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 承認フローの現在状態（承認 / 差し戻しのゲートと表示）。 */
  approval: ApprovalActionState;
  /** 証憑（document_attachments 由来、証憑タブ）。 */
  attachments: AttachmentView[];
  /** 正規化された承認記録（approval_records — 代理承認マーカー付き）。 */
  approvalTrail?: ApprovalTrailView[];
  /** この発注書から起きた素材入荷（手続き状況の「次の書類へ」）。 */
  receipts?: MaterialReceiptView[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("items");
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const po = purchaseOrder;

  /** history Json の action → 表示ラベル。 */
  const historyActionLabel: Record<string, string> = {
    CREATE: tr("common.create2"),
    UPDATE: tr("common.update"),
    REQUEST_APPROVAL: tr("common.approvalRequest"),
    APPROVE: tr("common.approve"),
    REJECT: tr("common.reject"),
    ORDER: tr("purchase.purchaseOrders.order"),
    COMPLETE: tr("purchase.purchaseOrders.received"),
    CANCEL: tr("common.cancel"),
  };

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: done,
          message: `${tr("common.materialPurchaseOrder")} ${po.poNumber}`,
          color: "green",
        });
        setCancelOpen(false);
        setCancelReason("");
        setOrderOpen(false);
        setCompleteOpen(false);
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  // 遷移履歴は新しい順で表示
  const records = [...po.history].reverse();

  // ── 手続き状況（依頼 → 承認 → 発注 → 入荷完了）─────────────────────────
  const stages = procedureStages(
    [
      {
        key: "requested",
        label: tr("common.request"),
        description: po.requestedAt
          ? fmt.date(po.requestedAt)
          : tr("common.draft"),
      },
      approvalStage(approval, {
        approvedAt: po.approvedAt,
        fmtDate: (v) => fmt.date(v),
        tr,
      }),
      {
        key: "ordered",
        label: tr("purchase.purchaseOrders.order"),
        description: po.orderedAt
          ? fmt.date(po.orderedAt)
          : tr("purchase.purchaseOrders.toExpectedReceipts"),
      },
      {
        key: "completed",
        label: tr("purchase.purchaseOrders.received"),
        description: po.completedAt
          ? fmt.date(po.completedAt)
          : tr("purchase.purchaseOrders.receiveIntoStock"),
      },
    ],
    currentStage(po),
    { stopped: po.status === "CANCELLED" },
  );

  // 上流 = 変換元の購買依頼（直接起票した発注書には無い）。
  const sourceGroups: HandoffGroup[] | undefined = po.sourceRequestNumber
    ? [
        {
          key: "purchase-request",
          title: tr("common.purchaseRequest"),
          items: [
            {
              key: po.sourceRequestNumber,
              label: po.sourceRequestNumber,
              href: `/purchase/purchase-requests/${encodeURIComponent(po.sourceRequestNumber)}`,
              note: tr("purchase.purchaseOrders.whatThisPurchaseOrderCameFrom"),
            },
          ],
          emptyNote: "—",
        },
      ]
    : undefined;

  // 下流 = この発注書から起きた素材入荷（明細ごとなので複数行になり得る）。
  const receivedQuantity = receipts.reduce((sum, r) => sum + r.quantity, 0);
  const handoffGroups: HandoffGroup[] = [
    {
      key: "material-receipts",
      title: tr("common.materialReceipt"),
      summary:
        receipts.length > 0
          ? tr("purchase.purchaseOrders.receiptsSummary", {
              count: receipts.length,
              total: receivedQuantity,
              unit: receipts[0]?.unit ?? "",
            })
          : null,
      items: receipts.map((r) => ({
        key: r.id,
        label: r.materialCode,
        href: `/purchase/material-receipts/${r.id}`,
        done: true,
        note: tr("purchase.purchaseOrders.receiptNote", {
          quantity: r.quantity,
          unit: r.unit,
          date: fmt.date(r.receivedAt),
        }),
      })),
      emptyNote:
        po.status === "ORDERED"
          ? tr("purchase.purchaseOrders.notReceivedGoesIntoStockWhen")
          : tr("purchase.purchaseOrders.notReceivedArrivesAfterOrdering"),
    },
  ];

  /**
   * 「いまやること」カード（最上部）。承認依頼中は承認権限の有無で色が変わる
   * — 権限あり = 緑 + 承認/差し戻し、権限なし = グレーの「承認依頼中」表示。
   */
  let actionCard: ReactNode = null;
  if (po.status === "DRAFT" || po.status === "REQUESTED") {
    // 依頼・承認・差し戻しは 4 書類共通のカードに任せる（段数は承認設定 MS0B）
    actionCard = (
      <ApprovalActionCard
        approval={approval}
        canRequest={po.status === "DRAFT"}
        onApprove={() => approvePurchaseOrder(po.poNumber)}
        onReject={(reason) => rejectPurchaseOrder(po.poNumber, reason)}
        onRequest={() => requestPurchaseApproval(po.poNumber)}
        rejectReason={null}
        subject={`${tr("common.materialPurchaseOrder")} ${po.poNumber}`}
      />
    );
  } else if (po.status === "APPROVED") {
    actionCard = (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconTruck size={14} />}
            loading={isPending}
            onClick={() => setOrderOpen(true)}
          >
            {tr("purchase.purchaseOrders.order")}
          </PrimaryButton>
        }
        description={tr("purchase.purchaseOrders.onceOrderedTheLinesAppearAs")}
        icon={<IconTruck size={20} />}
        title={tr("purchase.purchaseOrders.readyToOrder")}
        tone="action"
      />
    );
  } else if (po.status === "ORDERED") {
    actionCard = (
      <ActionCard
        actions={
          <ApproveButton
            leftSection={<IconPackageImport size={14} />}
            loading={isPending}
            onClick={() => setCompleteOpen(true)}
          >
            {tr("purchase.purchaseOrders.received")}
          </ApproveButton>
        }
        description={tr(
          "purchase.purchaseOrders.completingTheReceiptRecordsEachLine",
        )}
        icon={<IconPackageImport size={20} />}
        title={tr("purchase.purchaseOrders.waitingForTheGoods")}
        tone="action"
      />
    );
  }

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={
            isCancellable(po)
              ? [
                  {
                    label: tr("common.cancel"),
                    icon: <IconX size={14} />,
                    color: "red",
                    onClick: () => setCancelOpen(true),
                  },
                ]
              : []
          }
          onEdit={
            isEditable(po)
              ? () => router.push(`${BASE_PATH}/${po.poNumber}/edit`)
              : undefined
          }
        />
      }
      breadcrumbs={[
        tr("common.purchasing"),
        { label: tr("common.materialPurchaseOrder"), href: BASE_PATH },
        tr("common.detailBreadcrumb"),
      ]}
      createdAt={fmt.dateTime(po.createdAt)}
      status={<StatusBadge entity="MaterialPurchaseOrder" status={po.status} />}
      title={po.poNumber}
      updatedAt={fmt.dateTime(po.updatedAt)}
    >
      {actionCard}

      <SummaryGrid>
        <FieldValue
          label={tr("common.pONumber")}
          value={<DocNumber>{po.poNumber}</DocNumber>}
        />
        <FieldValue label={tr("common.supplier")} value={po.supplierName} />
        <FieldValue label={tr("common.createdBy")} value={po.createdByName} />
        <FieldValue
          label={tr("common.orderDate")}
          value={fmt.date(po.purchaseDate)}
        />
        <FieldValue
          label={tr("common.totalAmount")}
          value={<MoneyText ta="left" value={po.totalAmount} />}
        />
        <FieldValue
          label={tr("common.lineCount")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {po.items.length} 件
            </Text>
          }
        />
        <FieldValue
          label={tr("purchase.purchaseOrders.receiptCompletedOn")}
          value={po.completedAt ? fmt.dateTime(po.completedAt) : "—"}
        />
        {po.sourceRequestNumber && (
          <FieldValue
            label={tr("purchase.purchaseOrders.convertedFromPurchaseRequest")}
            value={
              <Link
                href={`/purchase/purchase-requests/${encodeURIComponent(po.sourceRequestNumber)}`}
              >
                <DocNumber>{po.sourceRequestNumber}</DocNumber>
              </Link>
            }
          />
        )}
      </SummaryGrid>

      <ProcedurePanel
        cancelled={po.status === "CANCELLED"}
        cancelledNote={po.cancelReason}
        handoffGroups={handoffGroups}
        sourceGroups={sourceGroups}
        stages={stages}
      >
        {/* 承認記録 — approval_records 由来（代理は「（代理: 原承認者）」付き） */}
        {countTrailRecords(approvalTrail) > 0 && (
          <>
            <Divider my="md" />
            <ApprovalTrailList trail={approvalTrail} />
          </>
        )}

        {records.length > 0 && (
          <>
            <Divider my="md" />
            <Stack gap="xs">
              {records.map((h, i) => (
                <Group gap="sm" key={`${h.at}-${h.action}-${i}`} wrap="nowrap">
                  <Badge color="gray" size="sm" variant="light">
                    {historyActionLabel[h.action] ?? h.action}
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

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="items">
            {tr("common.lineItemsWithCount", { count: po.items.length })}
          </Tabs.Tab>
          <Tabs.Tab value="attachments">
            {tr("common.supportingDocumentsWithCount", {
              count: attachments.length,
            })}
          </Tabs.Tab>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="items">
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("common.materials")}</Table.Th>
                  <Table.Th>{tr("common.receivingSite")}</Table.Th>
                  <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
                  <Table.Th ta="right">{tr("common.unitPrice")}</Table.Th>
                  <Table.Th ta="right">{tr("common.amount")}</Table.Th>
                  <Table.Th>{tr("common.expectedDate")}</Table.Th>
                  <Table.Th>{tr("common.notes")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {po.items.map((it) => (
                  <Table.Tr key={it.id}>
                    <Table.Td>
                      <Text ff="mono" size="sm">
                        {it.materialCode}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {it.materialName}
                      </Text>
                    </Table.Td>
                    <Table.Td>{it.plantName ?? "—"}</Table.Td>
                    <Table.Td className="tabular-nums" ta="right">
                      {it.quantity} {it.unit}
                      {po.status === "ORDERED" || po.status === "COMPLETED" ? (
                        <Text
                          c={
                            it.receivedQuantity >= it.quantity
                              ? "green"
                              : "dimmed"
                          }
                          size="xs"
                        >
                          {tr("purchase.purchaseOrders.receivedSoFar", {
                            count: it.receivedQuantity,
                          })}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td ta="right">
                      <MoneyText value={it.unitPrice} />
                    </Table.Td>
                    <Table.Td ta="right">
                      <MoneyText value={it.amount} />
                    </Table.Td>
                    <Table.Td className="tabular-nums">
                      {fmt.date(it.expectedAt)}
                    </Table.Td>
                    <Table.Td>
                      <Text c="dimmed" size="xs">
                        {it.notes ?? "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group justify="flex-end" mt="sm">
            <Text fw={700}>
              {tr("common.totalAmount")} <MoneyText value={po.totalAmount} />
            </Text>
          </Group>
        </Tabs.Panel>

        {/* 証憑 — 注文書控え・納品書控え等。添付は承認後（APPROVED 以降）のみ */}
        <Tabs.Panel pt="md" value="attachments">
          <Stack gap="sm">
            {!canAttachEvidence(po) && (
              <Text c="dimmed" size="xs">
                {tr(
                  "purchase.purchaseOrders.supportingDocumentsCanBeAttachedAfter",
                )}
              </Text>
            )}
            <AttachmentsPanel
              attachments={attachments}
              canDelete={canAttachEvidence(po)}
              canUpload={canAttachEvidence(po)}
              ownerId={po.poNumber}
              ownerType="material_purchase_orders"
              title={tr("common.supportingDocument")}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.notes")}
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {po.notes || "—"}
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      {/* キャンセル（発注前のみ・理由必須） */}
      <ModalShell
        confirmColor="red"
        confirmLabel={tr("common.cancelDocument")}
        loading={isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          if (!cancelReason.trim()) {
            notifications.show({
              title: tr("common.error2"),
              message: tr("common.enterAReasonForCancelling"),
              color: "red",
            });
            return;
          }
          run(
            () => cancelPurchaseOrder(po.poNumber, cancelReason),
            tr("common.cancelled"),
          );
        }}
        opened={cancelOpen}
        size="sm"
        title={tr("common.confirmCancellation")}
      >
        <Text size="sm">
          {tr("purchase.purchaseOrders.confirmCancelBody", {
            number: po.poNumber,
          })}
        </Text>
        <Textarea
          autosize
          label={tr("common.reasonForCancelling")}
          minRows={3}
          onChange={(e) => setCancelReason(e.currentTarget.value)}
          placeholder={tr("common.enterAReason")}
          value={cancelReason}
          withAsterisk
        />
      </ModalShell>

      {/* 発注の確認 */}
      <ModalShell
        confirmLabel={tr("purchase.purchaseOrders.placeTheOrder")}
        loading={isPending}
        onClose={() => setOrderOpen(false)}
        onConfirm={() =>
          run(
            () => orderPurchaseOrder(po.poNumber),
            tr("purchase.purchaseOrders.ordered"),
          )
        }
        opened={orderOpen}
        size="sm"
        title={tr("purchase.purchaseOrders.confirmTheOrder")}
      >
        <Text size="sm">
          {tr("purchase.purchaseOrders.confirmOrderBody", {
            number: po.poNumber,
          })}
        </Text>
      </ModalShell>

      {/* 入荷完了の確認（全量入荷） */}
      <ModalShell
        confirmLabel={tr("purchase.purchaseOrders.markTheReceiptComplete")}
        loading={isPending}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() =>
          run(
            () => completePurchaseOrder(po.poNumber),
            tr("purchase.purchaseOrders.markedTheReceiptComplete"),
          )
        }
        opened={completeOpen}
        size="sm"
        title={tr("purchase.purchaseOrders.confirmReceiptCompletion")}
      >
        <Text size="sm">
          {tr("purchase.purchaseOrders.confirmCompleteBody", {
            count: po.items.length,
          })}
        </Text>
      </ModalShell>
    </DetailShell>
  );
}
