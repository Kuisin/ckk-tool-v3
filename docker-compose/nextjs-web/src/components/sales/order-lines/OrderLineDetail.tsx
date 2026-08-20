"use client";

/**
 * OrderLineDetail — 注文明細 詳細 (PD21, design.md §8.2).
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
  Modal,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconClipboardList,
  IconLock,
  IconPackageImport,
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelOrderLine,
  runStockCheck,
} from "@/app/(dashboard)/sales/order-lines/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ConfirmModal } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import type { MemoView } from "@/lib/document-memos";
import {
  ORDER_TYPE_LABEL,
  SHIPPING_TYPE_LABEL,
  WORK_ORDER_TYPE_LABEL,
} from "@/lib/enum-labels";
// type-only import — lib/inventory は server-only（型はバンドルされない）。
import type { StockCheckResult } from "@/lib/inventory";
import { isLineStockCheckable } from "@/lib/order-line-core";
import { isCancellable, type OrderLine } from "./model";

const BASE_PATH = "/sales/order-lines";

export function OrderLineDetail({
  order,
  auditEntries,
  memos,
}: {
  order: OrderLine;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 社内メモ（document_memos 由来、メモタブ）。 */
  memos: MemoView[];
}) {
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isChecking, startStockCheck] = useTransition();
  const [stockResult, setStockResult] = useState<StockCheckResult | null>(null);

  // 在庫照合（§4）は確定済み・製造前のみ（製造中以降は指示書側で管理）。
  const canStockCheck = isLineStockCheckable(order);

  const runStock = () => {
    startStockCheck(async () => {
      const result = await runStockCheck(order.uuid);
      if (result.ok) {
        setStockResult(result.data);
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
      const result = await cancelOrderLine(order.orderNumber);
      if (result.ok) {
        notifications.show({
          title: "キャンセルしました",
          message: `注文明細 ${order.orderNumber} をキャンセルしました`,
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
          {/* §4 在庫照合 — 在庫レコード確認 + 利用可能分の引当予約。 */}
          {canStockCheck && (
            <SecondaryButton
              leftSection={<IconPackageImport size={14} />}
              loading={isChecking}
              onClick={runStock}
            >
              在庫照合
            </SecondaryButton>
          )}
          <ResourceActions
            menuItems={[
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
          />
        </Group>
      }
      breadcrumbs={["販売", { label: "注文明細", href: BASE_PATH }, "詳細"]}
      createdAt={fmt.dateTime(order.createdAt)}
      status={<StatusBadge entity="OrderLine" status={order.status} />}
      title={order.orderNumber}
      updatedAt={fmt.dateTime(order.updatedAt)}
    >
      {order.isLocked && (
        <Alert
          color="orange"
          icon={<IconLock size={16} />}
          title="承認依頼中ロック"
          variant="light"
        >
          この注文明細は承認依頼中のためロックされています。承認が完了するまで編集できません。
        </Alert>
      )}

      <SummaryGrid>
        <FieldValue
          label="注文明細番号"
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
        <FieldValue label="納期" value={fmt.date(order.deliveryDate)} />
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
        {/* 営業担当・作成者は注文請書ヘッダの値（行では編集しない）。 */}
        <FieldValue label="営業担当" value={order.salesRepName} />
        <FieldValue label="作成者" value={order.createdByName} />
        <FieldValue
          label="引当済み在庫"
          value={
            order.reservedStockQuantity > 0 ? (
              <Group gap="xs" wrap="nowrap">
                <Text className="tabular-nums" size="sm" span>
                  {order.reservedStockQuantity} / {order.quantity} 本
                </Text>
                <Badge color="orange" variant="light">
                  予約中
                </Badge>
              </Group>
            ) : (
              <Text c="dimmed" size="sm" span>
                未引当（在庫照合で引当）
              </Text>
            )
          }
        />
        <FieldValue
          label="出荷済み"
          value={
            <Text className="tabular-nums" size="sm" span>
              {order.shippedQuantity} / {order.quantity} 本
            </Text>
          }
        />
      </SummaryGrid>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="work-orders">
            指示書（{order.workOrders.length}）
          </Tabs.Tab>
          <Tabs.Tab value="shipping">
            出荷（{order.shippingOrders.length}）
          </Tabs.Tab>
          <Tabs.Tab value="memo">メモ</Tabs.Tab>
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
                  href={`/production/work-orders/new?orderLine=${order.uuid}`}
                  leftSection={<IconClipboardList size={14} />}
                >
                  指示書を作成
                </SecondaryButton>
              }
              icon={<IconClipboardList size={24} />}
              message="この注文明細の指示書はまだありません"
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

        <Tabs.Panel pt="md" value="shipping">
          {order.shippingOrders.length === 0 ? (
            <EmptyState
              icon={<IconTruck size={24} />}
              message="この注文明細の出荷書はまだありません"
            />
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>出荷書番号</Table.Th>
                    <Table.Th>種別</Table.Th>
                    <Table.Th ta="right">数量</Table.Th>
                    <Table.Th>状態</Table.Th>
                    <Table.Th>出荷日</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {order.shippingOrders.map((s) => (
                    <Table.Tr
                      key={s.number}
                      onClick={() =>
                        router.push(`/shipping/shipping-orders/${s.number}`)
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <Table.Td>
                        <DocNumber>{s.number}</DocNumber>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={s.type === "DISPATCH" ? "blue" : "gray"}
                          variant="light"
                        >
                          {SHIPPING_TYPE_LABEL[s.type] ?? s.type}
                        </Badge>
                      </Table.Td>
                      <Table.Td className="tabular-nums" ta="right">
                        {s.quantity}
                      </Table.Td>
                      <Table.Td>
                        <StatusBadge entity="ShippingOrder" status={s.status} />
                      </Table.Td>
                      <Table.Td>{fmt.date(s.shippedAt)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Tabs.Panel>

        {/* keepMounted={false}: エディタ（prosemirror）はタブを開くまで読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="memo">
          <MemoPanel
            memos={memos}
            mode="memo"
            ownerId={order.orderNumber}
            ownerType="order_lines"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      {/* 在庫照合の結果（引当 / 不足） */}
      <Modal
        onClose={() => setStockResult(null)}
        opened={stockResult != null}
        title="在庫照合結果"
        withinPortal
      >
        {stockResult && (
          <Stack gap="sm">
            {!stockResult.hasRecord && (
              <Alert
                color="yellow"
                icon={<IconAlertTriangle size={16} />}
                variant="light"
              >
                この製品の在庫レコードがありません（照合①）。
              </Alert>
            )}
            <Group gap="xl">
              <FieldValue
                label="引当"
                value={
                  <Text
                    c={stockResult.reservedNow > 0 ? "green" : undefined}
                    className="tabular-nums"
                    fw={600}
                    size="sm"
                    span
                  >
                    {stockResult.reservedNow} 本
                  </Text>
                }
              />
              <FieldValue
                label="不足"
                value={
                  <Text
                    c={stockResult.shortage > 0 ? "red" : "dimmed"}
                    className="tabular-nums"
                    fw={600}
                    size="sm"
                    span
                  >
                    {stockResult.shortage} 本
                  </Text>
                }
              />
              <FieldValue
                label="照合時の利用可能数"
                value={
                  <Text className="tabular-nums" size="sm" span>
                    {stockResult.available} 本
                  </Text>
                }
              />
            </Group>
            {stockResult.shortage > 0 ? (
              <Alert
                color="orange"
                icon={<IconAlertTriangle size={16} />}
                title={
                  stockResult.reservedNow > 0
                    ? "在庫分＋製造分の分割（§4）"
                    : "在庫不足"
                }
                variant="light"
              >
                <Stack gap="xs">
                  <Text size="sm">
                    {stockResult.reservedNow > 0
                      ? `在庫 ${stockResult.reservedNow} 本を引当済み。在庫分と不足 ${stockResult.shortage} 本の製造分に分割して指示書を作成してください。`
                      : `不足分 ${stockResult.shortage} 本は製造分の指示書を作成してください。`}
                  </Text>
                  <Group>
                    {stockResult.reservedNow > 0 && (
                      <SecondaryButton
                        href={`/production/work-orders/new?orderLine=${order.uuid}&type=FROM_STOCK&qty=${stockResult.reservedNow}`}
                        leftSection={<IconClipboardList size={14} />}
                      >
                        在庫分の指示書（{stockResult.reservedNow} 本）
                      </SecondaryButton>
                    )}
                    <SecondaryButton
                      href={`/production/work-orders/new?orderLine=${order.uuid}&type=MANUFACTURE&qty=${stockResult.shortage}`}
                      leftSection={<IconClipboardList size={14} />}
                    >
                      製造分の指示書（{stockResult.shortage} 本）
                    </SecondaryButton>
                  </Group>
                </Stack>
              </Alert>
            ) : (
              <Alert
                color="green"
                icon={<IconCheck size={16} />}
                variant="light"
              >
                <Stack gap="xs">
                  <Text size="sm">
                    受注数量をすべて在庫から引当できました。
                  </Text>
                  {stockResult.reservedNow > 0 && (
                    <Group>
                      <SecondaryButton
                        href={`/production/work-orders/new?orderLine=${order.uuid}&type=FROM_STOCK&qty=${stockResult.reservedNow}`}
                        leftSection={<IconClipboardList size={14} />}
                      >
                        在庫分の指示書（{stockResult.reservedNow} 本）
                      </SecondaryButton>
                    </Group>
                  )}
                </Stack>
              </Alert>
            )}
          </Stack>
        )}
      </Modal>

      <ConfirmModal
        confirmLabel="キャンセルする"
        loading={isPending}
        message={`注文明細 ${order.orderNumber} をキャンセルします。この操作は取り消せません。`}
        onClose={() => setCancelOpen(false)}
        onConfirm={runCancel}
        opened={cancelOpen}
        title="キャンセルの確認"
      />
    </DetailShell>
  );
}
