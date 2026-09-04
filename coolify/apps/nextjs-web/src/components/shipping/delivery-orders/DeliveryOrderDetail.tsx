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
  Alert,
  Anchor,
  Badge,
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
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { ConfirmModal } from "@/components/ui/modals";
import {
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
import type { MemoView } from "@/lib/document-memos";
import { deliveryMethodLabel } from "@/lib/enum-labels";
import type { ActionResult } from "@/lib/server-action";
import { statusLabel } from "@/lib/status-map";
import { DeliveryOrderTypeBadge } from "./DeliveryOrderTable";
import { type DeliveryOrder, isEditable } from "./model";

const BASE_PATH = "/shipping/delivery-orders";

/**
 * 確定モーダルの予告 — 確定すると納品書が自動で作られることを、宛先まで
 * 具体的に見せる（何通・誰宛・価格記載の有無）。作られない出荷書
 * （在庫保管・明細ゼロ）では何も出さない。
 */
function AutoDeliveryNotesPreview({ order }: { order: DeliveryOrder }) {
  const tr = useTranslations();
  const { notes } = order.autoDeliveryNotes;
  if (notes.length === 0) return null;
  return (
    <Alert color="blue" icon={<IconReceipt size={16} />} variant="light">
      <Stack gap={6}>
        <Text fw={600} size="sm">
          {tr("shipping.deliveryOrders.autoNotesHeading")}
        </Text>
        {notes.map((n) => (
          <Group
            gap="xs"
            key={`${n.recipientName}:${n.includePrice}`}
            wrap="nowrap"
          >
            <Text size="sm">{n.recipientName}</Text>
            <Badge
              color={n.includePrice ? "blue" : "gray"}
              size="xs"
              variant="light"
            >
              {n.includePrice
                ? tr("shipping.deliveryOrders.autoNoteWithPrice")
                : tr("shipping.deliveryOrders.autoNoteWithoutPrice")}
            </Badge>
          </Group>
        ))}
      </Stack>
    </Alert>
  );
}

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
  const stages = procedureStages(
    [
      {
        key: "created",
        label: tr("common.create2"),
        description: fmtDate(order.createdAt),
      },
      { key: "confirmed", label: tr("common.confirmed"), description: null },
      {
        key: "shipped",
        label: isStock
          ? tr("shipping.deliveryOrders.storedToStock")
          : tr("common.shipping"),
        description: order.shippedAt ? fmtDate(order.shippedAt) : null,
      },
    ],
    order.status === "DRAFT" ? 1 : order.status === "CONFIRMED" ? 2 : 3,
  );

  // 上流 = 束ねた注文明細（在庫保管はゼロ件もあり得る）と、ヘッダ紐付けの指示書。
  const sourceGroups: HandoffGroup[] = [
    {
      key: "order-lines",
      title: tr("common.orderLine"),
      summary:
        order.orderLineNumbers.length > 0
          ? tr("common.itemsCount", { count: order.orderLineNumbers.length })
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
              ? tr("common.itemsCount", { count: order.deliveryNotes.length })
              : null,
          items: order.deliveryNotes.map((dn) => ({
            key: dn.deliveryNumber,
            label: dn.deliveryNumber,
            href: `/shipping/delivery-notes/${dn.deliveryNumber}`,
            done: dn.status === "DELIVERED",
            note: tr("shipping.deliveryOrders.deliveryNoteNote", {
              status: statusLabel("DeliveryNote", dn.status),
              recipient: dn.recipientName,
            }),
          })),
          emptyNote:
            order.status === "SHIPPED"
              ? tr("shipping.deliveryOrders.noDeliveryNoteHasBeenCreated")
              : tr("shipping.deliveryOrders.notCreatedTheDeliveryNoteIs"),
        },
      ];

  return (
    <ProcedurePanel
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
                    label: tr("common.cancel"),
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
        tr("common.detailBreadcrumb"),
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
          {tr("common.lineItemsWithCount", { count: order.items.length })}
        </Title>
        <Table.ScrollContainer minWidth={560}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{tr("common.product")}</Table.Th>
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
            {tr("common.deliveryNotesWithCount", {
              count: order.deliveryNotes.length,
            })}
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
              icon={<IconReceipt size={24} />}
              message={
                order.type === "STOCK_STORAGE"
                  ? tr("shipping.deliveryOrders.stockStorageHasNoDeliveryNote")
                  : order.status === "DRAFT"
                    ? tr("shipping.deliveryOrders.youCanCreateTheDeliveryNote")
                    : tr("shipping.deliveryOrders.thereIsNoDeliveryNoteFor")
              }
            />
          ) : (
            <Stack gap="sm">
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
        details={<AutoDeliveryNotesPreview order={order} />}
        loading={isPending}
        message={tr("shipping.deliveryOrders.confirmConfirmBody", {
          number: order.deliveryOrderNumber,
        })}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          run(
            () => confirmDeliveryOrder(order.deliveryOrderNumber),
            tr("common.confirmed2"),
            tr(
              order.type === "DISPATCH"
                ? "shipping.deliveryOrders.confirmedBodyDispatch"
                : "shipping.deliveryOrders.confirmedBody",
              { number: order.deliveryOrderNumber },
            ),
          )
        }
        opened={confirmOpen}
        title={tr("common.confirm")}
        warning={
          order.autoDeliveryNotes.endUserMissing
            ? tr("shipping.deliveryOrders.autoNotesEndUserMissing")
            : undefined
        }
      />
      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("shipping.deliveryOrders.ship")}
        loading={isPending}
        message={
          order.type === "DISPATCH"
            ? tr("shipping.deliveryOrders.confirmShipBodyDispatch", {
                number: order.deliveryOrderNumber,
              })
            : tr("shipping.deliveryOrders.confirmShipBodyStock", {
                number: order.deliveryOrderNumber,
              })
        }
        onClose={() => setShipOpen(false)}
        onConfirm={() =>
          run(
            () => shipDeliveryOrder(order.deliveryOrderNumber),
            tr("shipping.deliveryOrders.shipped"),
            tr("shipping.deliveryOrders.shippedBody", {
              number: order.deliveryOrderNumber,
            }),
          )
        }
        opened={shipOpen}
        title={tr("shipping.deliveryOrders.confirmTheShipment")}
      />
      <ConfirmModal
        confirmLabel={tr("common.cancelDocument")}
        loading={isPending}
        message={tr("shipping.deliveryOrders.confirmDeleteBody", {
          number: order.deliveryOrderNumber,
        })}
        onClose={() => setCancelOpen(false)}
        onConfirm={() =>
          run(
            () => deleteDeliveryOrder(order.deliveryOrderNumber),
            tr("common.cancelled"),
            tr("shipping.deliveryOrders.deletedBody", {
              number: order.deliveryOrderNumber,
            }),
            () => router.push(BASE_PATH),
          )
        }
        opened={cancelOpen}
        title={tr("common.confirmCancellation")}
      />
    </DetailShell>
  );
}
