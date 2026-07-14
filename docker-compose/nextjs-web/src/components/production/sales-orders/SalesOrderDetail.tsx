"use client";

/**
 * SalesOrderDetail — 注文請書 詳細 (PD21, design.md §8.2).
 *
 * SummaryGrid（番号 / 顧客(+支店) / 顧客注文書番号 / 製品 / 注文種別 / 数量 /
 * 単価 / 金額 / 納期 / ロット番号 / 見積元）+ ロック中 Alert +
 * Tabs: 概要 / 指示書（work_orders 一覧・行クリックで指示書詳細へ）/ 履歴。
 *
 * Actions: 編集（DRAFT のみ・ロック中は無効 + tooltip）/ 確定（DRAFT →
 * CONFIRMED, 確認モーダル）/ キャンセル（出荷済以降は不可, 確認モーダル・赤）。
 */

import {
  Alert,
  Anchor,
  Badge,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconClipboardList,
  IconLock,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelSalesOrder,
  confirmSalesOrder,
} from "@/app/(dashboard)/production/sales-orders/actions";
import { EditButton, SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ConfirmModal } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { ORDER_TYPE_LABEL, WORK_ORDER_TYPE_LABEL } from "@/lib/enum-labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { isCancellable, isEditable, type SalesOrder } from "./model";

const BASE_PATH = "/production/sales-orders";

export function SalesOrderDetail({
  order,
  auditEntries,
}: {
  order: SalesOrder;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const editable = isEditable(order);
  const lockedDraft = order.status === "DRAFT" && order.isLocked;

  const runConfirm = () => {
    startTransition(async () => {
      const result = await confirmSalesOrder(order.orderNumber);
      if (result.ok) {
        notifications.show({
          title: "確定しました",
          message: `注文請書 ${order.orderNumber} を確定しました`,
          color: "green",
        });
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

  const runCancel = () => {
    startTransition(async () => {
      const result = await cancelSalesOrder(order.orderNumber);
      if (result.ok) {
        notifications.show({
          title: "キャンセルしました",
          message: `注文請書 ${order.orderNumber} をキャンセルしました`,
          color: "green",
        });
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

  return (
    <DetailShell
      actions={
        <Group gap="xs" wrap="nowrap">
          {/* 編集は DRAFT のみ — ロック中は無効化して理由を tooltip 表示。 */}
          {lockedDraft && (
            <Tooltip label="承認依頼中のためロックされています" withArrow>
              <span>
                <EditButton disabled />
              </span>
            </Tooltip>
          )}
          <ResourceActions
            menuItems={[
              ...(order.status === "DRAFT"
                ? [
                    {
                      label: "確定",
                      icon: <IconCheck size={14} />,
                      onClick: () => setConfirmOpen(true),
                    },
                  ]
                : []),
              ...(isCancellable(order)
                ? [
                    {
                      label: "キャンセル",
                      icon: <IconX size={14} />,
                      color: "red",
                      divider: true,
                      onClick: () => setCancelOpen(true),
                    },
                  ]
                : []),
            ]}
            onEdit={
              editable
                ? () => router.push(`${BASE_PATH}/${order.id}/edit`)
                : undefined
            }
          />
        </Group>
      }
      breadcrumbs={["生産", { label: "注文請書", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(order.createdAt)}
      status={<StatusBadge entity="SalesOrder" status={order.status} />}
      title={order.orderNumber}
      updatedAt={formatDateTime(order.updatedAt)}
    >
      {order.isLocked && (
        <Alert
          color="orange"
          icon={<IconLock size={16} />}
          title="承認依頼中ロック"
          variant="light"
        >
          この注文請書は承認依頼中のためロックされています。承認が完了するまで編集できません。
        </Alert>
      )}

      <SummaryGrid>
        <FieldValue
          label="注文請書番号"
          value={<DocNumber>{order.orderNumber}</DocNumber>}
        />
        <FieldValue
          label="顧客"
          value={
            order.customerBranchName
              ? `${order.customerName} / ${order.customerBranchName}`
              : order.customerName
          }
        />
        <FieldValue
          label="顧客注文書番号"
          value={order.customerOrderRef ?? "—"}
        />
        <FieldValue label="製品" value={order.productName} />
        <FieldValue
          label="注文種別"
          value={
            <Badge color="gray" variant="light">
              {ORDER_TYPE_LABEL[order.orderType] ?? order.orderType}
            </Badge>
          }
        />
        <FieldValue
          label="数量"
          value={
            <Text className="tabular-nums" size="sm" span>
              {order.quantity} 本
            </Text>
          }
        />
        <FieldValue
          label="単価"
          value={<MoneyText ta="left" value={order.unitPrice} />}
        />
        <FieldValue
          label="金額"
          value={<MoneyText ta="left" value={order.amount} />}
        />
        <FieldValue label="納期" value={formatDate(order.deliveryDate)} />
        <FieldValue
          label="ロット番号"
          value={
            order.lotNumber != null ? (
              <DocNumber>{order.lotNumber}</DocNumber>
            ) : (
              <Text c="dimmed" size="sm" span>
                未採番（指示書作成時に採番）
              </Text>
            )
          }
        />
        <FieldValue
          label="見積元"
          value={
            order.quoteNumber ? (
              <Anchor
                onClick={() =>
                  router.push(`/sales/quotes/${order.quoteNumber}`)
                }
                size="sm"
              >
                <DocNumber c="blue">{order.quoteNumber}</DocNumber>
              </Anchor>
            ) : (
              "—"
            )
          }
        />
        <FieldValue label="最終需要家" value={order.endUserName ?? "—"} />
      </SummaryGrid>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="work-orders">
            指示書（{order.workOrders.length}）
          </Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                備考
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {order.notes || "—"}
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="work-orders">
          {order.workOrders.length === 0 ? (
            <EmptyState
              action={
                <SecondaryButton
                  href={`/production/work-orders/new?salesOrder=${order.uuid}`}
                  leftSection={<IconClipboardList size={14} />}
                >
                  指示書を作成
                </SecondaryButton>
              }
              icon={<IconClipboardList size={24} />}
              message="この注文請書の指示書はまだありません"
            />
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>指示書番号</Table.Th>
                    <Table.Th>種別</Table.Th>
                    <Table.Th ta="right">予定数量</Table.Th>
                    <Table.Th>承認状態</Table.Th>
                    <Table.Th>状態</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {order.workOrders.map((wo) => (
                    <Table.Tr
                      key={wo.workOrderNumber}
                      onClick={() =>
                        router.push(
                          `/production/work-orders/${wo.workOrderNumber}`,
                        )
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <Table.Td>
                        <DocNumber>{wo.workOrderNumber}</DocNumber>
                      </Table.Td>
                      <Table.Td>
                        <Badge color="gray" variant="light">
                          {WORK_ORDER_TYPE_LABEL[wo.type] ?? wo.type}
                        </Badge>
                      </Table.Td>
                      <Table.Td className="tabular-nums" ta="right">
                        {wo.plannedQuantity}
                      </Table.Td>
                      <Table.Td>
                        <StatusBadge
                          entity="WorkOrderApproval"
                          status={wo.approvalStatus}
                        />
                      </Table.Td>
                      <Table.Td>
                        <StatusBadge entity="WorkOrder" status={wo.status} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <ConfirmModal
        confirmColor="blue"
        confirmLabel="確定"
        loading={isPending}
        message={`注文請書 ${order.orderNumber} を確定します。確定後は編集できません。`}
        onClose={() => setConfirmOpen(false)}
        onConfirm={runConfirm}
        opened={confirmOpen}
        title="確定の確認"
      />
      <ConfirmModal
        confirmLabel="キャンセルする"
        loading={isPending}
        message={`注文請書 ${order.orderNumber} をキャンセルします。この操作は取り消せません。`}
        onClose={() => setCancelOpen(false)}
        onConfirm={runCancel}
        opened={cancelOpen}
        title="キャンセルの確認"
      />
    </DetailShell>
  );
}
