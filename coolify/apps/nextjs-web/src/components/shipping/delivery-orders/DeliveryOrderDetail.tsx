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
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  confirmDeliveryOrder,
  deleteDeliveryOrder,
  shipDeliveryOrder,
} from "@/app/(dashboard)/shipping/delivery-orders/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import type { MemoView } from "@/lib/document-memos";
import { deliveryMethodLabel } from "@/lib/enum-labels";
import type { ActionResult } from "@/lib/server-action";
import { statusLabel } from "@/lib/status-map";
import { DeliveryOrderTypeBadge } from "./DeliveryOrderTable";
import { canCreateDeliveryNote, type DeliveryOrder, isEditable } from "./model";

const BASE_PATH = "/shipping/delivery-orders";

/** 手続き状況（作成 → 確定 → 出荷）+ 前後の書類への受け渡し。 */
function DeliveryOrderProcedurePanel({
  order,
  fmtDate,
}: {
  order: DeliveryOrder;
  fmtDate: (v: string | null) => string | null;
}) {
  const tr = useTranslations();
  const isStock = order.type === "STOCK_STORAGE";
  const stages: ProcedureStage[] = [
    {
      key: "created",
      label: tr("common.create2"),
      description: fmtDate(order.createdAt),
    },
    { key: "confirmed", label: tr("common.confirmed"), description: null },
    {
      key: "shipped",
      label: isStock ? "保管（在庫へ）" : tr("common.shipping"),
      description: order.shippedAt ? fmtDate(order.shippedAt) : null,
    },
  ];
  const active =
    order.status === "DRAFT" ? 1 : order.status === "CONFIRMED" ? 2 : 3;

  // 上流 = 束ねた注文明細（在庫保管はゼロ件もあり得る）と、ヘッダ紐付けの指示書。
  const sourceGroups: HandoffGroup[] = [
    {
      key: "order-lines",
      title: tr("common.orderLine"),
      summary:
        order.orderLineNumbers.length > 0
          ? `${order.orderLineNumbers.length} 件`
          : null,
      items: order.orderLineNumbers.map((n) => ({
        key: n,
        label: n,
        href: `/sales/order-lines/${n}`,
      })),
      emptyNote: isStock
        ? tr("shipping.deliveryOrders.stockStorageSoNotTiedTo")
        : tr("shipping.deliveryOrders.shipmentNotTiedToAnOrder"),
    },
    ...(order.workOrderNumber != null
      ? [
          {
            key: "work-order",
            title: tr("common.workOrder"),
            items: [
              {
                key: String(order.workOrderNumber),
                label: `#${order.workOrderNumber}`,
                href: `/production/work-orders/${order.workOrderNumber}`,
                note: tr("shipping.deliveryOrders.whereTheShippedLotWasMade"),
              },
            ],
            emptyNote: "—",
          },
        ]
      : []),
  ];

  // 在庫保管（請求フロー外）は納品書を作らない — セクション自体を出さない。
  const handoffGroups: HandoffGroup[] | undefined = isStock
    ? undefined
    : [
        {
          key: "delivery-notes",
          title: tr("common.deliveryNote"),
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
              ? tr("shipping.deliveryOrders.noDeliveryNoteHasBeenCreated")
              : tr("shipping.deliveryOrders.notCreatedTheDeliveryNoteIs"),
        },
      ];

  return (
    <ProcedurePanel
      active={active}
      handoffGroups={handoffGroups}
      sourceGroups={sourceGroups}
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
  const tr = useTranslations();
  const locale = useLocale();
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
          title: tr("common.error2"),
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
                    label: tr("common.confirmed"),
                    icon: <IconCheck size={14} />,
                    onClick: () => setConfirmOpen(true),
                  },
                ]
              : []),
            ...(order.status === "CONFIRMED"
              ? [
                  {
                    label: tr("common.shipping"),
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
      breadcrumbs={[
        tr("common.shipping"),
        { label: tr("common.deliveryOrder"), href: BASE_PATH },
        "詳細",
      ]}
      createdAt={fmt.dateTime(order.createdAt)}
      status={<StatusBadge entity="DeliveryOrder" status={order.status} />}
      title={order.deliveryOrderNumber}
      updatedAt={fmt.dateTime(order.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("common.deliveryOrderNumber")}
          value={<DocNumber>{order.deliveryOrderNumber}</DocNumber>}
        />
        <FieldValue
          label={tr("common.orderLineNumber")}
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
          label={tr("common.customer")}
          value={
            order.customerBranchName
              ? `${order.customerName} / ${order.customerBranchName}`
              : order.customerName
          }
        />
        <FieldValue
          label={tr("common.salesRep")}
          value={
            order.salesRepNames.length > 0
              ? order.salesRepNames.join("、")
              : null
          }
        />
        <FieldValue
          label={tr("common.createdBy")}
          value={order.createdByName}
        />
        <FieldValue
          label={tr("common.type2")}
          value={<DeliveryOrderTypeBadge type={order.type} />}
        />
        <FieldValue
          label={tr("shipping.deliveryOrders.fromSite")}
          value={order.fromPlantName ?? "—"}
        />
        <FieldValue
          label={tr("common.totalQuantity")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {order.totalQuantity}
            </Text>
          }
        />
        <FieldValue
          label={tr("common.shippedDate")}
          value={fmt.date(order.shippedAt)}
        />
        <FieldValue
          label={tr("shipping.deliveryOrders.workOrderLinkedAtHeader")}
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
                <Table.Th>{tr("common.lot")}</Table.Th>
                <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
                <Table.Th>{tr("common.notes")}</Table.Th>
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

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="delivery-notes">
            納品書（{order.deliveryNotes.length}）
          </Tabs.Tab>
          <Tabs.Tab value="memo">{tr("common.memo")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.notes")}
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
                    {tr("shipping.deliveryOrders.createADeliveryNote")}
                  </SecondaryButton>
                ) : undefined
              }
              icon={<IconReceipt size={24} />}
              message={
                canCreateDeliveryNote(order)
                  ? tr("shipping.deliveryOrders.thereIsNoDeliveryNoteFor")
                  : tr("shipping.deliveryOrders.youCanCreateTheDeliveryNote")
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
                    {tr("shipping.deliveryOrders.createADeliveryNote")}
                  </SecondaryButton>
                </Group>
              )}
              <Table.ScrollContainer minWidth={560}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{tr("common.deliveryNoteNumber")}</Table.Th>
                      <Table.Th>{tr("common.shipTo")}</Table.Th>
                      <Table.Th>{tr("common.method2")}</Table.Th>
                      <Table.Th>{tr("common.status")}</Table.Th>
                      <Table.Th>{tr("common.deliveredDate")}</Table.Th>
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
                            {deliveryMethodLabel(dn.deliveryMethod, locale) ??
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
      </AppTabs>

      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("common.confirmed")}
        loading={isPending}
        message={`出荷書 ${order.deliveryOrderNumber} を確定します。確定後は編集できません。`}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          run(
            () => confirmDeliveryOrder(order.deliveryOrderNumber),
            tr("common.confirmed2"),
            `出荷書 ${order.deliveryOrderNumber} を確定しました`,
          )
        }
        opened={confirmOpen}
        title={tr("common.confirm")}
      />
      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("shipping.deliveryOrders.ship")}
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
            tr("shipping.deliveryOrders.shipped"),
            `出荷書 ${order.deliveryOrderNumber} を出荷済みにしました`,
          )
        }
        opened={shipOpen}
        title={tr("shipping.deliveryOrders.confirmTheShipment")}
      />
      <ConfirmModal
        confirmLabel={tr("common.cancelDocument")}
        loading={isPending}
        message={`出荷書 ${order.deliveryOrderNumber} を削除します。この操作は取り消せません。`}
        onClose={() => setCancelOpen(false)}
        onConfirm={() =>
          run(
            () => deleteDeliveryOrder(order.deliveryOrderNumber),
            tr("common.cancelled"),
            `出荷書 ${order.deliveryOrderNumber} を削除しました`,
            () => router.push(BASE_PATH),
          )
        }
        opened={cancelOpen}
        title={tr("common.confirmCancellation")}
      />
    </DetailShell>
  );
}
