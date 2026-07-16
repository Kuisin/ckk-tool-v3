"use client";

/**
 * PurchaseOrderDetail — 素材発注書 詳細 (PU23, design.md §8.2)。
 *
 * SummaryGrid + 承認/遷移パネル（線形 Stepper 依頼→承認→発注→入荷完了 +
 * 状態別アクション）+ Tabs（明細 / 概要 / 履歴）。
 *
 * 状態別アクション:
 *   DRAFT: 承認依頼 + 編集 / キャンセル
 *   REQUESTED: 承認（isApprover("FIRST") ゲート）/ 差し戻し（理由必須 → DRAFT）
 *   APPROVED: 発注（→ ORDERED — 明細が素材 ATP の入荷予定に反映）/ キャンセル
 *   ORDERED: 入荷完了（明細ごとに全量入荷の MaterialReceipt を作成し在庫入庫）
 */

import {
  Alert,
  Badge,
  Divider,
  Group,
  Paper,
  Stack,
  Stepper,
  Table,
  Tabs,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconPackageImport,
  IconSend,
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  completePurchaseOrder,
  orderPurchaseOrder,
  rejectPurchaseOrder,
  requestPurchaseApproval,
} from "@/app/(dashboard)/purchase/purchase-orders/actions";
import {
  ApprovalTrailList,
  type ApprovalTrailView,
  countTrailRecords,
} from "@/components/production/ApprovalStatusPanel";
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@/components/ui/AttachmentsPanel";
import {
  ApproveButton,
  PrimaryButton,
  RejectButton,
} from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import {
  canAttachEvidence,
  isCancellable,
  isEditable,
  PURCHASE_HISTORY_ACTION_LABEL,
  type PurchaseOrderView,
} from "./model";

const BASE_PATH = "/purchase/purchase-orders";

/** status → Stepper の active index（依頼 / 承認 / 発注 / 入荷完了）。 */
function stepperActive(status: string): number {
  switch (status) {
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
      return -1; // CANCELLED
  }
}

export function PurchaseOrderDetail({
  purchaseOrder,
  auditEntries,
  canApprove,
  attachments,
  approvalTrail = [],
}: {
  purchaseOrder: PurchaseOrderView;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 第一承認グループのメンバー（or 代理）か（承認 / 差し戻しのゲート）。 */
  canApprove: boolean;
  /** 証憑（document_attachments 由来、証憑タブ）。 */
  attachments: AttachmentView[];
  /** 正規化された承認記録（approval_records — 代理承認マーカー付き）。 */
  approvalTrail?: ApprovalTrailView[];
}) {
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("items");
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  const po = purchaseOrder;

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: done,
          message: `素材発注書 ${po.poNumber}`,
          color: "green",
        });
        setRejectOpen(false);
        setRejectReason("");
        setCancelOpen(false);
        setCancelReason("");
        setOrderOpen(false);
        setCompleteOpen(false);
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

  // 遷移履歴は新しい順で表示
  const records = [...po.history].reverse();

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={
            isCancellable(po)
              ? [
                  {
                    label: "キャンセル",
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
      breadcrumbs={["購買", { label: "素材発注書", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(po.createdAt)}
      status={<StatusBadge entity="MaterialPurchaseOrder" status={po.status} />}
      title={po.poNumber}
      updatedAt={formatDateTime(po.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="発注番号"
          value={<DocNumber>{po.poNumber}</DocNumber>}
        />
        <FieldValue label="仕入先" value={po.supplierName} />
        <FieldValue label="発注日" value={formatDate(po.purchaseDate)} />
        <FieldValue
          label="合計金額"
          value={<MoneyText ta="left" value={po.totalAmount} />}
        />
        <FieldValue
          label="明細数"
          value={
            <Text className="tabular-nums" size="sm" span>
              {po.items.length} 件
            </Text>
          }
        />
        <FieldValue
          label="入荷完了日"
          value={po.completedAt ? formatDateTime(po.completedAt) : "—"}
        />
        {po.sourceRequestNumber && (
          <FieldValue
            label="変換元（購買依頼）"
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

      {/* 承認 / 遷移パネル — 指示書の ApprovalStatusPanel と同型（線形 4 段階） */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="md" order={5}>
          承認・発注状況
        </Title>

        <Stepper active={stepperActive(po.status)} size="sm">
          <Stepper.Step
            description={po.requestedAt ? formatDate(po.requestedAt) : "作成中"}
            label="依頼"
            loading={po.status === "DRAFT"}
          />
          <Stepper.Step
            description={
              po.approvedAt ? formatDate(po.approvedAt) : "第一承認グループ"
            }
            label="承認"
            loading={po.status === "REQUESTED"}
          />
          <Stepper.Step
            description={po.orderedAt ? formatDate(po.orderedAt) : "入荷予定へ"}
            label="発注"
            loading={po.status === "APPROVED"}
          />
          <Stepper.Step
            description={
              po.completedAt ? formatDate(po.completedAt) : "在庫入庫"
            }
            label="入荷完了"
            loading={po.status === "ORDERED"}
          />
        </Stepper>

        {po.status === "CANCELLED" && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            mt="md"
            title="キャンセル済"
            variant="light"
          >
            {po.cancelReason ?? "—"}
          </Alert>
        )}

        <Group gap="xs" mt="md">
          {po.status === "DRAFT" && (
            <PrimaryButton
              leftSection={<IconSend size={14} />}
              loading={isPending}
              onClick={() =>
                run(
                  () => requestPurchaseApproval(po.poNumber),
                  "承認依頼しました",
                )
              }
            >
              承認依頼
            </PrimaryButton>
          )}
          {po.status === "REQUESTED" &&
            (canApprove ? (
              <>
                <ApproveButton
                  loading={isPending}
                  onClick={() =>
                    run(() => approvePurchaseOrder(po.poNumber), "承認しました")
                  }
                >
                  承認
                </ApproveButton>
                <RejectButton onClick={() => setRejectOpen(true)} />
              </>
            ) : (
              <Text c="dimmed" size="xs">
                第一承認グループのメンバーのみ承認・差し戻しできます
              </Text>
            ))}
          {po.status === "APPROVED" && (
            <PrimaryButton
              leftSection={<IconTruck size={14} />}
              loading={isPending}
              onClick={() => setOrderOpen(true)}
            >
              発注
            </PrimaryButton>
          )}
          {po.status === "ORDERED" && (
            <ApproveButton
              leftSection={<IconPackageImport size={14} />}
              loading={isPending}
              onClick={() => setCompleteOpen(true)}
            >
              入荷完了
            </ApproveButton>
          )}
        </Group>

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
                    {PURCHASE_HISTORY_ACTION_LABEL[h.action] ?? h.action}
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

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="items">明細（{po.items.length}）</Tabs.Tab>
          <Tabs.Tab value="attachments">証憑（{attachments.length}）</Tabs.Tab>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="items">
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>素材</Table.Th>
                  <Table.Th>入荷先工場</Table.Th>
                  <Table.Th ta="right">数量</Table.Th>
                  <Table.Th ta="right">単価</Table.Th>
                  <Table.Th ta="right">金額</Table.Th>
                  <Table.Th>入荷予定日</Table.Th>
                  <Table.Th>備考</Table.Th>
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
                    <Table.Td>{it.factoryName ?? "—"}</Table.Td>
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
                          入荷済 {it.receivedQuantity}
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
                      {formatDate(it.expectedAt)}
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
              合計金額 <MoneyText value={po.totalAmount} />
            </Text>
          </Group>
        </Tabs.Panel>

        {/* 証憑 — 注文書控え・納品書控え等。添付は承認後（APPROVED 以降）のみ */}
        <Tabs.Panel pt="md" value="attachments">
          <Stack gap="sm">
            {!canAttachEvidence(po) && (
              <Text c="dimmed" size="xs">
                証憑の添付は承認後（承認済・発注済・入荷完了）に可能になります
              </Text>
            )}
            <AttachmentsPanel
              attachments={attachments}
              canDelete={canAttachEvidence(po)}
              canUpload={canAttachEvidence(po)}
              ownerId={po.poNumber}
              ownerType="material_purchase_orders"
              title="証憑"
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                備考
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
      </Tabs>

      {/* 差し戻し（理由必須 → DRAFT へ戻す） */}
      <ModalShell
        confirmColor="red"
        confirmLabel="差し戻す"
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => {
          if (!rejectReason.trim()) {
            notifications.show({
              title: "エラー",
              message: "差し戻し理由を入力してください",
              color: "red",
            });
            return;
          }
          run(
            () => rejectPurchaseOrder(po.poNumber, rejectReason),
            "差し戻しました",
          );
        }}
        opened={rejectOpen}
        size="sm"
        title="差し戻しの確認"
      >
        <Textarea
          autosize
          label="差し戻し理由"
          minRows={3}
          onChange={(e) => setRejectReason(e.currentTarget.value)}
          placeholder="理由を入力"
          value={rejectReason}
          withAsterisk
        />
      </ModalShell>

      {/* キャンセル（発注前のみ・理由必須） */}
      <ModalShell
        confirmColor="red"
        confirmLabel="キャンセルする"
        loading={isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          if (!cancelReason.trim()) {
            notifications.show({
              title: "エラー",
              message: "キャンセル理由を入力してください",
              color: "red",
            });
            return;
          }
          run(
            () => cancelPurchaseOrder(po.poNumber, cancelReason),
            "キャンセルしました",
          );
        }}
        opened={cancelOpen}
        size="sm"
        title="キャンセルの確認"
      >
        <Text size="sm">
          素材発注書 {po.poNumber}{" "}
          をキャンセルします。この操作は取り消せません。
        </Text>
        <Textarea
          autosize
          label="キャンセル理由"
          minRows={3}
          onChange={(e) => setCancelReason(e.currentTarget.value)}
          placeholder="理由を入力"
          value={cancelReason}
          withAsterisk
        />
      </ModalShell>

      {/* 発注の確認 */}
      <ModalShell
        confirmLabel="発注する"
        loading={isPending}
        onClose={() => setOrderOpen(false)}
        onConfirm={() =>
          run(() => orderPurchaseOrder(po.poNumber), "発注しました")
        }
        opened={orderOpen}
        size="sm"
        title="発注の確認"
      >
        <Text size="sm">
          素材発注書 {po.poNumber}{" "}
          を発注済にします。明細は素材在庫の入荷予定（ATP）に反映されます。
        </Text>
      </ModalShell>

      {/* 入荷完了の確認（全量入荷） */}
      <ModalShell
        confirmLabel="入荷完了にする"
        loading={isPending}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() =>
          run(() => completePurchaseOrder(po.poNumber), "入荷完了にしました")
        }
        opened={completeOpen}
        size="sm"
        title="入荷完了の確認"
      >
        <Text size="sm">
          明細 {po.items.length}{" "}
          件を全量入荷として素材入荷を登録し、入荷先工場の素材在庫へ入庫します。
          分納（部分入荷）が必要な場合は素材入荷 (PU01)
          から直接登録してください。
        </Text>
      </ModalShell>
    </DetailShell>
  );
}
