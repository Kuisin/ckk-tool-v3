"use client";

/**
 * DeliveryOrderDetail — 出荷書 詳細 (SH21, design.md §8.2).
 *
 * SummaryGrid（番号 / 注文明細番号 link / 顧客 / 種別 / 出荷元拠点 / 出荷日 …）+
 * 明細テーブル（製品 / ロット / 数量 / 備考）+
 * Tabs: 概要 / 納品書（DRN 一覧 + 作成ボタン）/ 履歴。
 *
 * Actions: 編集（DRAFT のみ）/ 確定（DRAFT → CONFIRMED）/
 * 出荷（CONFIRMED → SHIPPED + 注文明細の出荷状態再計算）/
 * キャンセル（DRAFT のみ hard delete, 確認モーダル・赤）。
 */

import {
  Anchor,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconReceipt, IconTruck, IconX } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  confirmDeliveryOrder,
  deleteDeliveryOrder,
  shipDeliveryOrder,
} from "@/app/(dashboard)/shipping/delivery-orders/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { ConfirmModal } from "@/components/ui/modals";
import {
  type HandoffGroup,
  ProcedurePanel,
  type ProcedureStage,
} from "@/components/ui/ProcedurePanel";
import { StatusBadge, statusLabel } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import type { MemoView } from "@/lib/document-memos";
import { DELIVERY_METHOD_LABEL } from "@/lib/enum-labels";
import type { ActionResult } from "@/lib/server-action";
import { DeliveryOrderTypeBadge } from "./DeliveryOrderTable";
import { canCreateDeliveryNote, type DeliveryOrder, isEditable } from "./model";

const BASE_PATH = "/shipping/delivery-orders";

/** 手続き状況（作成 → 確定 → 出荷）+ 納品書への受け渡し。 */
function DeliveryOrderProcedurePanel({
  order,
  fmtDate,
}: {
  order: DeliveryOrder;
  fmtDate: (v: string | null) => string | null;
}) {
  const isStock = order.type === "STOCK_STORAGE";
  const stages: ProcedureStage[] = [
    { key: "created", label: "作成", description: fmtDate(order.createdAt) },
    { key: "confirmed", label: "確定", description: null },
    {
      key: "shipped",
      label: isStock ? "保管（在庫へ）" : "出荷",
      description: order.shippedAt ? fmtDate(order.shippedAt) : null,
    },
  ];
  const active =
    order.status === "DRAFT" ? 1 : order.status === "CONFIRMED" ? 2 : 3;

  // 在庫保管（請求フロー外）は納品書を作らない — セクション自体を出さない。
  const handoffGroups: HandoffGroup[] | undefined = isStock
    ? undefined
    : [
        {
          key: "delivery-notes",
          title: "納品書",
          summary:
            order.deliveryNotes.length > 0
              ? `${order.deliveryNotes.length} 件`
              : null,
          items: order.deliveryNotes.map((dn) => ({
            key: dn.deliveryNumber,
            label: dn.deliveryNumber,
            href: `/shipping/delivery-notes/${dn.deliveryNumber}`,
            done: dn.status === "DELIVERED",
            note: `${statusLabel("DeliveryNote", dn.status)}・${dn.recipientName}`,
          })),
          emptyNote:
            order.status === "SHIPPED"
              ? "納品書は未作成です"
              : "未作成（出荷後に納品書を作成します）",
        },
      ];

  return (
    <ProcedurePanel
      active={active}
      handoffGroups={handoffGroups}
      stages={stages}
    />
  );
}

export function DeliveryOrderDetail({
  order,
  auditEntries,
  memos,
}: {
  order: DeliveryOrder;
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const run = (
    action: () => Promise<ActionResult>,
    successTitle: string,
    successMessage: string,
    afterSuccess?: () => void,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: successTitle,
          message: successMessage,
          color: "green",
        });
        if (afterSuccess) afterSuccess();
        else router.refresh();
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
            ...(order.status === "CONFIRMED"
              ? [
                  {
                    label: "出荷",
                    icon: <IconTruck size={14} />,
                    onClick: () => setShipOpen(true),
                  },
                ]
              : []),
            ...(order.status === "DRAFT"
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
            isEditable(order)
              ? () => router.push(`${BASE_PATH}/${order.id}/edit`)
              : undefined
          }
        />
      }
      breadcrumbs={["出荷", { label: "出荷書", href: BASE_PATH }, "詳細"]}
      createdAt={fmt.dateTime(order.createdAt)}
      status={<StatusBadge entity="DeliveryOrder" status={order.status} />}
      title={order.deliveryOrderNumber}
      updatedAt={fmt.dateTime(order.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="出荷書番号"
          value={<DocNumber>{order.deliveryOrderNumber}</DocNumber>}
        />
        <FieldValue
          label="注文明細番号"
          value={
            order.orderLineNumbers.length > 0 ? (
              <Stack gap={2}>
                {order.orderLineNumbers.map((n) => (
                  <Anchor
                    key={n}
                    onClick={() =>
                      router.push(`/sales/order-lines/${encodeURIComponent(n)}`)
                    }
                    size="sm"
                  >
                    <DocNumber c="blue">{n}</DocNumber>
                  </Anchor>
                ))}
              </Stack>
            ) : (
              "—"
            )
          }
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
          label="営業担当"
          value={
            order.salesRepNames.length > 0
              ? order.salesRepNames.join("、")
              : null
          }
        />
        <FieldValue label="作成者" value={order.createdByName} />
        <FieldValue
          label="種別"
          value={<DeliveryOrderTypeBadge type={order.type} />}
        />
        <FieldValue label="出荷元拠点" value={order.fromPlantName ?? "—"} />
        <FieldValue
          label="数量合計"
          value={
            <Text className="tabular-nums" size="sm" span>
              {order.totalQuantity}
            </Text>
          }
        />
        <FieldValue label="出荷日" value={fmt.date(order.shippedAt)} />
        <FieldValue
          label="指示書（ヘッダ紐付け）"
          value={
            order.workOrderNumber != null ? (
              <DocNumber>{order.workOrderNumber}</DocNumber>
            ) : (
              "—"
            )
          }
        />
      </SummaryGrid>

      <DeliveryOrderProcedurePanel
        fmtDate={(v) => (v ? fmt.date(v) : null)}
        order={order}
      />

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          明細（{order.items.length}）
        </Title>
        <Table.ScrollContainer minWidth={560}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>製品</Table.Th>
                <Table.Th>ロット</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th>備考</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {order.items.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{it.productName}</Table.Td>
                  <Table.Td>
                    {it.lotNumber != null ? (
                      <DocNumber>{it.lotNumber}</DocNumber>
                    ) : (
                      <Text c="dimmed" size="sm">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td className="tabular-nums" ta="right">
                    {it.quantity}
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      {it.notes ?? "—"}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="delivery-notes">
            納品書（{order.deliveryNotes.length}）
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

        <Tabs.Panel pt="md" value="delivery-notes">
          {order.deliveryNotes.length === 0 ? (
            <EmptyState
              action={
                canCreateDeliveryNote(order) ? (
                  <SecondaryButton
                    href={`/shipping/delivery-notes/new?deliveryOrder=${order.id}`}
                    leftSection={<IconReceipt size={14} />}
                  >
                    納品書を作成
                  </SecondaryButton>
                ) : undefined
              }
              icon={<IconReceipt size={24} />}
              message={
                canCreateDeliveryNote(order)
                  ? "この出荷書の納品書はまだありません"
                  : "納品書は確定後に作成できます"
              }
            />
          ) : (
            <Stack gap="sm">
              {canCreateDeliveryNote(order) && (
                <Group justify="flex-end">
                  <SecondaryButton
                    href={`/shipping/delivery-notes/new?deliveryOrder=${order.id}`}
                    leftSection={<IconReceipt size={14} />}
                  >
                    納品書を作成
                  </SecondaryButton>
                </Group>
              )}
              <Table.ScrollContainer minWidth={560}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>納品番号</Table.Th>
                      <Table.Th>納品先</Table.Th>
                      <Table.Th>方法</Table.Th>
                      <Table.Th>状態</Table.Th>
                      <Table.Th>納品日</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {order.deliveryNotes.map((dn) => (
                      <Table.Tr
                        key={dn.deliveryNumber}
                        onClick={() =>
                          router.push(
                            `/shipping/delivery-notes/${dn.deliveryNumber}`,
                          )
                        }
                        style={{ cursor: "pointer" }}
                      >
                        <Table.Td>
                          <DocNumber c="blue">{dn.deliveryNumber}</DocNumber>
                        </Table.Td>
                        <Table.Td>{dn.recipientName}</Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {DELIVERY_METHOD_LABEL[dn.deliveryMethod] ??
                              dn.deliveryMethod}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <StatusBadge
                            entity="DeliveryNote"
                            status={dn.status}
                          />
                        </Table.Td>
                        <Table.Td className="tabular-nums">
                          {fmt.date(dn.deliveredAt)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Stack>
          )}
        </Tabs.Panel>

        {/* keepMounted={false}: エディタ（prosemirror）はタブを開くまで読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="memo">
          <MemoPanel
            memos={memos}
            mode="memo"
            ownerId={order.deliveryOrderNumber}
            ownerType="delivery_orders"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <ConfirmModal
        confirmColor="blue"
        confirmLabel="確定"
        loading={isPending}
        message={`出荷書 ${order.deliveryOrderNumber} を確定します。確定後は編集できません。`}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          run(
            () => confirmDeliveryOrder(order.deliveryOrderNumber),
            "確定しました",
            `出荷書 ${order.deliveryOrderNumber} を確定しました`,
          )
        }
        opened={confirmOpen}
        title="確定の確認"
      />
      <ConfirmModal
        confirmColor="blue"
        confirmLabel="出荷する"
        loading={isPending}
        message={
          order.type === "DISPATCH"
            ? `出荷書 ${order.deliveryOrderNumber} を出荷済みにします。注文明細の出荷状態も再計算されます。`
            : `出荷書 ${order.deliveryOrderNumber} を出荷済みにします（在庫保管のため注文明細の出荷状態は変わりません）。`
        }
        onClose={() => setShipOpen(false)}
        onConfirm={() =>
          run(
            () => shipDeliveryOrder(order.deliveryOrderNumber),
            "出荷しました",
            `出荷書 ${order.deliveryOrderNumber} を出荷済みにしました`,
          )
        }
        opened={shipOpen}
        title="出荷の確認"
      />
      <ConfirmModal
        confirmLabel="キャンセルする"
        loading={isPending}
        message={`出荷書 ${order.deliveryOrderNumber} を削除します。この操作は取り消せません。`}
        onClose={() => setCancelOpen(false)}
        onConfirm={() =>
          run(
            () => deleteDeliveryOrder(order.deliveryOrderNumber),
            "キャンセルしました",
            `出荷書 ${order.deliveryOrderNumber} を削除しました`,
            () => router.push(BASE_PATH),
          )
        }
        opened={cancelOpen}
        title="キャンセルの確認"
      />
    </DetailShell>
  );
}
