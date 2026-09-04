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
  IconRuler2,
  IconSettings2,
  IconTruck,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { runStockCheck } from "@/app/(dashboard)/sales/order-lines/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DesignRequestLinks } from "@/components/sales/design-requests/DesignRequestLinks";
import type { DesignRequestLink } from "@/components/sales/design-requests/model";
import { AppTabs } from "@/components/ui/AppTabs";
import { SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { NextStepCard } from "@/components/ui/NextStepCard";
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
import {
  deliveryOrderTypeLabel,
  orderTypeLabel,
  workOrderTypeLabel,
} from "@/lib/enum-labels";
// type-only import — lib/inventory は server-only（型はバンドルされない）。
import type { StockCheckResult } from "@/lib/inventory";
import { isLineStockCheckable } from "@/lib/order-line-core";
import { statusLabel } from "@/lib/status-map";
import type { OrderLine } from "./model";

const BASE_PATH = "/sales/order-lines";

/** 手続き状況（作成 → 確定 → 製造 → 出荷）+ 前後の書類への受け渡し。 */
function OrderLineProcedurePanel({
  order,
  fmtDate,
}: {
  order: OrderLine;
  fmtDate: (v: string | null) => string;
}) {
  const tr = useTranslations();
  const cancelled = order.status === "CANCELLED";
  // 製造中は「製造」に留まっている（その先の出荷はまだ）。一部出荷まで来たら
  // 製造は済んだ段で、留まっているのは出荷。
  const current = (() => {
    switch (order.status) {
      case "DRAFT":
        return 1;
      case "CONFIRMED":
        return 2;
      case "IN_PRODUCTION":
        return 2;
      case "PARTIAL_SHIPPED":
        return 3;
      case "SHIPPED":
        return 4;
      default:
        // CANCELLED — 進んだところまで。以降は skipped（もう通らない）。
        return order.workOrders.length > 0 ? 2 : 1;
    }
  })();
  const stages = procedureStages(
    [
      {
        key: "created",
        label: tr("common.create2"),
        description: fmtDate(order.createdAt),
      },
      { key: "confirmed", label: tr("common.confirmed"), description: null },
      {
        key: "production",
        label: tr("common.manufacture"),
        description:
          order.workOrders.length > 0
            ? tr("sales.orderLineDetail.workOrdersCount", {
                count: order.workOrders.length,
              })
            : null,
      },
      {
        key: "shipped",
        label: tr("common.shipping"),
        description:
          order.status === "PARTIAL_SHIPPED"
            ? tr("sales.orderLineDetail.partiallyShippedProgress", {
                shipped: order.shippedQuantity,
                quantity: order.quantity,
              })
            : order.status === "SHIPPED"
              ? tr("common.quantityPcs", { quantity: order.shippedQuantity })
              : null,
      },
    ],
    current,
    { stopped: cancelled },
  );

  // 上流 = この明細が載っている注文請書と、その見積元。
  const sourceGroups: HandoffGroup[] = [
    {
      key: "acceptance",
      title: tr("common.orderAcceptance"),
      items: [
        {
          key: order.acceptanceNumber,
          label: order.acceptanceNumber,
          href: `/sales/order-acceptances/${order.acceptanceNumber}`,
          note: tr("sales.orderLines.parentDocumentOfThisLine"),
        },
      ],
      emptyNote: "—",
    },
    ...(order.quoteNumber
      ? [
          {
            key: "quote",
            title: tr("common.quote"),
            items: [
              {
                key: order.quoteNumber,
                label: order.quoteNumber,
                href: `/sales/quotes/${order.quoteNumber}`,
                note: tr("sales.orderLines.quoteTheOrderAcceptanceCameFrom"),
              },
            ],
            emptyNote: "—",
          },
        ]
      : []),
  ];

  const allocated = order.workOrders.reduce(
    (sum, w) => sum + w.allocatedQuantity,
    0,
  );
  const handoffGroups: HandoffGroup[] = [
    {
      key: "work-orders",
      title: tr("sales.orderLines.workOrderProductionPlanning"),
      summary:
        order.reservedStockQuantity > 0
          ? tr("sales.orderLineDetail.allocatedProgressWithReserved", {
              allocated,
              quantity: order.quantity,
              reserved: order.reservedStockQuantity,
            })
          : tr("sales.orderLineDetail.allocatedProgress", {
              allocated,
              quantity: order.quantity,
            }),
      items: order.workOrders.map((w) => ({
        key: w.docNumber,
        label: w.docNumber,
        href: `/production/work-orders/${w.workOrderNumber}`,
        done: w.status === "COMPLETED",
        note: tr("sales.orderLineDetail.workOrderNote", {
          status: statusLabel("WorkOrder", w.status),
          quantity: w.allocatedQuantity,
        }),
      })),
      emptyNote: tr("sales.orderLines.notPlannedNoWorkOrder"),
    },
    {
      key: "delivery-orders",
      title: tr("common.deliveryOrder"),
      summary: tr("sales.orderLineDetail.shippedProgress", {
        shipped: order.shippedQuantity,
        quantity: order.quantity,
      }),
      items: order.deliveryOrders.map((s, i) => ({
        key: `${s.number}-${i}`,
        label: s.number,
        href: `/shipping/delivery-orders/${s.number}`,
        done: s.status === "SHIPPED",
        note:
          s.type === "STOCK_STORAGE"
            ? tr("sales.orderLineDetail.deliveryOrderNoteStockStorage", {
                status: statusLabel("DeliveryOrder", s.status),
                quantity: s.quantity,
              })
            : tr("sales.orderLineDetail.deliveryOrderNote", {
                status: statusLabel("DeliveryOrder", s.status),
                quantity: s.quantity,
              }),
      })),
      emptyNote: tr("sales.orderLines.notPlannedNoDeliveryOrder"),
    },
  ];

  return (
    <ProcedurePanel
      cancelled={cancelled}
      handoffGroups={handoffGroups}
      sourceGroups={sourceGroups}
      stages={stages}
    />
  );
}

export function OrderLineDetail({
  order,
  auditEntries,
  memos,
  designRequests = [],
}: {
  order: OrderLine;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 社内メモ（document_memos 由来、メモタブ）。 */
  memos: MemoView[];
  /** この注文明細に紐づく設計依頼（§10 — 設計タブ）。 */
  designRequests?: DesignRequestLink[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");
  const [isChecking, startStockCheck] = useTransition();

  // 指示書作成の可否 — 確定済み（製造に入れる状態）かつ 未手配数量が残って
  // いるときだけ。押せない理由は三点メニューのグレーアウト項目で説明する。
  const activeAllocated = order.workOrders
    .filter((w) => w.status !== "CANCELLED")
    .reduce((sum, w) => sum + w.allocatedQuantity, 0);
  const remainingToAllocate = Math.max(0, order.quantity - activeAllocated);
  const woCreatable =
    !order.isLocked &&
    (order.status === "CONFIRMED" || order.status === "IN_PRODUCTION") &&
    remainingToAllocate > 0;
  const woDisabledReason = order.isLocked
    ? tr("sales.orderLines.lockedWhileApprovalIsPending")
    : order.status === "DRAFT"
      ? tr("sales.orderLines.youCanCreateThisOnceThe")
      : order.status === "CANCELLED"
        ? tr("sales.orderLines.youCannotCreateThisOnA")
        : remainingToAllocate === 0
          ? tr("sales.orderLines.everythingOrderedHasBeenPlanned")
          : order.status === "SHIPPED" || order.status === "PARTIAL_SHIPPED"
            ? tr("sales.orderLines.youCannotCreateThisOnA2")
            : undefined;
  const woCreateHref = `/production/work-orders/new?orderLine=${order.uuid}`;
  const designCreateHref = `/sales/design-requests/new?orderLine=${order.uuid}`;

  // 出荷書作成の可否 — 確定済み以降（キャンセル・全量出荷済みを除く）で
  // 未出荷数量が残っているときだけ。プリフィルは ?orderLine= が担う。
  const unshipped = Math.max(0, order.quantity - order.shippedQuantity);
  const doCreatable =
    !order.isLocked &&
    (order.status === "CONFIRMED" ||
      order.status === "IN_PRODUCTION" ||
      order.status === "PARTIAL_SHIPPED") &&
    unshipped > 0;
  const doDisabledReason = order.isLocked
    ? tr("sales.orderLines.lockedWhileApprovalIsPending")
    : order.status === "DRAFT"
      ? tr("sales.orderLines.youCanCreateThisOnceThe")
      : order.status === "CANCELLED"
        ? tr("sales.orderLines.youCannotCreateThisOnA")
        : unshipped === 0
          ? tr("sales.orderLines.everythingOrderedHasBeenShipped")
          : undefined;
  const doCreateHref = `/shipping/delivery-orders/new?orderLine=${order.uuid}`;
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
        <Group gap="xs" wrap="nowrap">
          {/* §4 在庫照合 — 在庫レコード確認 + 利用可能分の引当予約。 */}
          {canStockCheck && (
            <SecondaryButton
              leftSection={<IconPackageImport size={14} />}
              loading={isChecking}
              onClick={runStock}
            >
              {tr("sales.orderLines.stockCheck")}
            </SecondaryButton>
          )}
          {/* 明細単位のキャンセルは廃止 — キャンセルは注文請書（SA24）から
              「キャンセル依頼」で承認を通す。操作は状態に依らず全て並べ、
              押せないものはグレーアウトで理由を出す。 */}
          <ResourceActions
            menuItems={[
              {
                label: tr("sales.orderLines.createAWorkOrder"),
                icon: <IconSettings2 size={14} />,
                disabled: !woCreatable,
                disabledReason: woDisabledReason,
                onClick: () => router.push(woCreateHref),
              },
              {
                label: tr("common.createADeliveryOrder"),
                icon: <IconTruck size={14} />,
                disabled: !doCreatable,
                disabledReason: doDisabledReason,
                onClick: () => router.push(doCreateHref),
              },
              // §10 設計依頼は受注と並行する任意の側枝なので、NextStepCard
              // （＝唯一の次の一歩）ではなくここに置く。
              {
                label: tr("common.raiseADesignRequest"),
                icon: <IconRuler2 size={14} />,
                disabled: order.isLocked || order.status === "CANCELLED",
                disabledReason: order.isLocked
                  ? tr("sales.orderLines.lockedWhileApprovalIsPending")
                  : tr("sales.orderLines.youCannotRaiseThisOnA"),
                onClick: () => router.push(designCreateHref),
              },
            ]}
          />
        </Group>
      }
      breadcrumbs={[
        tr("common.sales"),
        { label: tr("common.orderLine"), href: BASE_PATH },
        tr("common.detailBreadcrumb"),
      ]}
      createdAt={fmt.dateTime(order.createdAt)}
      status={<StatusBadge entity="OrderLine" status={order.status} />}
      title={order.orderNumber}
      updatedAt={fmt.dateTime(order.updatedAt)}
    >
      {/* 次のステップ — 未手配が残るうちは指示書の作成、手配し終えて
          未出荷が残るなら出荷書の作成へ誘導する（1 度に出すのは 1 枚）。 */}
      {woCreatable ? (
        <NextStepCard
          buttonLabel={tr("sales.orderLines.createAWorkOrder")}
          description={tr(
            "sales.orderLineDetail.unplannedOpenWorkOrderBuilder",
            { quantity: remainingToAllocate },
          )}
          href={woCreateHref}
          icon={<IconSettings2 size={20} />}
          title={tr("sales.orderLines.nextStepCreateAWorkOrder")}
        />
      ) : doCreatable ? (
        <NextStepCard
          buttonLabel={tr("common.createADeliveryOrder")}
          description={tr(
            "sales.orderLineDetail.unshippedOpenDeliveryOrderForm",
            { quantity: unshipped },
          )}
          href={doCreateHref}
          icon={<IconTruck size={20} />}
          title={tr("common.nextStepCreateADeliveryOrder")}
        />
      ) : null}
      {order.isLocked && (
        <Alert
          color="orange"
          icon={<IconLock size={16} />}
          title={tr("sales.orderLines.lockedWhileApprovalIsPending2")}
          variant="light"
        >
          {tr("sales.orderLines.thisOrderLineIsLockedWhile")}
        </Alert>
      )}

      <SummaryGrid>
        <FieldValue
          label={tr("common.orderLineNumber")}
          value={<DocNumber>{order.orderNumber}</DocNumber>}
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
          label={tr("common.customerOrderRef")}
          value={order.customerOrderRef ?? "—"}
        />
        <FieldValue label={tr("common.product")} value={order.productName} />
        <FieldValue
          label={tr("common.orderType")}
          value={
            <Badge color="gray" variant="light">
              {orderTypeLabel(order.orderType, locale) ?? order.orderType}
            </Badge>
          }
        />
        <FieldValue
          label={tr("common.quantity")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {tr("common.quantityPcs", { quantity: order.quantity })}
            </Text>
          }
        />
        <FieldValue
          label={tr("common.unitPrice")}
          value={<MoneyText ta="left" value={order.unitPrice} />}
        />
        <FieldValue
          label={tr("common.amount")}
          value={<MoneyText ta="left" value={order.amount} />}
        />
        <FieldValue
          label={tr("common.deliveryDate")}
          value={fmt.date(order.deliveryDate)}
        />
        <FieldValue
          label={tr("common.lotNumber")}
          value={
            order.lotNumber != null ? (
              <DocNumber>{order.lotNumber}</DocNumber>
            ) : (
              <Text c="dimmed" size="sm" span>
                {tr("sales.orderLines.notNumberedNumberedWhenTheWork")}
              </Text>
            )
          }
        />
        <FieldValue
          label={tr("sales.orderLines.quoteSource")}
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
        <FieldValue
          label={tr("common.endUser")}
          value={order.endUserName ?? "—"}
        />
        {/* 営業担当・作成者は注文請書ヘッダの値（行では編集しない）。 */}
        <FieldValue label={tr("common.salesRep")} value={order.salesRepName} />
        <FieldValue
          label={tr("common.createdBy")}
          value={order.createdByName}
        />
        <FieldValue
          label={tr("sales.orderLines.allocatedStock")}
          value={
            order.reservedStockQuantity > 0 ? (
              <Group gap="xs" wrap="nowrap">
                <Text className="tabular-nums" size="sm" span>
                  {tr("sales.orderLineDetail.reservedOfQuantity", {
                    reserved: order.reservedStockQuantity,
                    quantity: order.quantity,
                  })}
                </Text>
                <Badge color="orange" variant="light">
                  {tr("sales.orderLines.reserved")}
                </Badge>
              </Group>
            ) : (
              <Text c="dimmed" size="sm" span>
                {tr("sales.orderLines.notAllocatedAllocateViaTheStock")}
              </Text>
            )
          }
        />
        <FieldValue
          label={tr("sales.orderLines.shipped")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {tr("sales.orderLineDetail.shippedOfQuantity", {
                shipped: order.shippedQuantity,
                quantity: order.quantity,
              })}
            </Text>
          }
        />
      </SummaryGrid>

      <OrderLineProcedurePanel fmtDate={(v) => fmt.date(v)} order={order} />

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="work-orders">
            {tr("sales.orderLineDetail.workOrdersWithCount", {
              count: order.workOrders.length,
            })}
          </Tabs.Tab>
          <Tabs.Tab value="shipping">
            {tr("sales.orderLineDetail.shippingWithCount", {
              count: order.deliveryOrders.length,
            })}
          </Tabs.Tab>
          <Tabs.Tab value="design">
            {tr("sales.orderLineDetail.designWithCount", {
              count: designRequests.length,
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

        <Tabs.Panel pt="md" value="work-orders">
          {order.workOrders.length === 0 ? (
            <EmptyState
              action={
                <SecondaryButton
                  href={`/production/work-orders/new?orderLine=${order.uuid}`}
                  leftSection={<IconClipboardList size={14} />}
                >
                  {tr("sales.orderLines.createAWorkOrder")}
                </SecondaryButton>
              }
              icon={<IconClipboardList size={24} />}
              message={tr("sales.orderLines.thereIsNoWorkOrderFor")}
            />
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tr("common.workOrderNumber")}</Table.Th>
                    <Table.Th>{tr("common.type2")}</Table.Th>
                    <Table.Th ta="right">
                      {tr("sales.orderLines.allocatedQuantity")}
                    </Table.Th>
                    <Table.Th ta="right">
                      {tr("common.plannedQuantity")}
                    </Table.Th>
                    <Table.Th>{tr("common.approvalStatus")}</Table.Th>
                    <Table.Th>{tr("common.status")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {order.workOrders.map((wo) => (
                    <Table.Tr
                      key={wo.workOrderNumber}
                      onClick={() =>
                        router.push(`/production/work-orders/${wo.docNumber}`)
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <Table.Td>
                        <DocNumber>{wo.docNumber}</DocNumber>
                      </Table.Td>
                      <Table.Td>
                        <Badge color="gray" variant="light">
                          {workOrderTypeLabel(wo.type, locale) ?? wo.type}
                        </Badge>
                      </Table.Td>
                      <Table.Td className="tabular-nums" ta="right">
                        {wo.allocatedQuantity}
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
          {order.deliveryOrders.length === 0 ? (
            <EmptyState
              action={
                doCreatable ? (
                  <SecondaryButton
                    href={doCreateHref}
                    leftSection={<IconTruck size={14} />}
                    size="xs"
                  >
                    {tr("common.createADeliveryOrder")}
                  </SecondaryButton>
                ) : undefined
              }
              icon={<IconTruck size={24} />}
              message={tr("sales.orderLines.thereIsNoDeliveryOrderFor")}
            />
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tr("common.deliveryOrderNumber")}</Table.Th>
                    <Table.Th>{tr("common.type2")}</Table.Th>
                    <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
                    <Table.Th>{tr("common.status")}</Table.Th>
                    <Table.Th>{tr("common.shippedDate")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {order.deliveryOrders.map((s) => (
                    <Table.Tr
                      key={s.number}
                      onClick={() =>
                        router.push(`/shipping/delivery-orders/${s.number}`)
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
                          {deliveryOrderTypeLabel(s.type, locale) ?? s.type}
                        </Badge>
                      </Table.Td>
                      <Table.Td className="tabular-nums" ta="right">
                        {s.quantity}
                      </Table.Td>
                      <Table.Td>
                        <StatusBadge entity="DeliveryOrder" status={s.status} />
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
        <Tabs.Panel pt="md" value="design">
          <DesignRequestLinks
            createDisabledReason={
              order.isLocked
                ? tr("sales.orderLines.lockedWhileApprovalIsPending")
                : order.status === "CANCELLED"
                  ? tr("sales.orderLines.youCannotRaiseThisOnA")
                  : undefined
            }
            createHref={designCreateHref}
            links={designRequests}
          />
        </Tabs.Panel>

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
      </AppTabs>

      {/* 在庫照合の結果（引当 / 不足） */}
      <Modal
        onClose={() => setStockResult(null)}
        opened={stockResult != null}
        title={tr("sales.orderLines.stockCheckResult")}
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
                {tr("sales.orderLines.thereIsNoStockRecordFor")}
              </Alert>
            )}
            <Group gap="xl">
              <FieldValue
                label={tr("sales.orderLines.allocated")}
                value={
                  <Text
                    c={stockResult.reservedNow > 0 ? "green" : undefined}
                    className="tabular-nums"
                    fw={600}
                    size="sm"
                    span
                  >
                    {tr("common.quantityPcs", {
                      quantity: stockResult.reservedNow,
                    })}
                  </Text>
                }
              />
              <FieldValue
                label={tr("sales.orderLines.short")}
                value={
                  <Text
                    c={stockResult.shortage > 0 ? "red" : "dimmed"}
                    className="tabular-nums"
                    fw={600}
                    size="sm"
                    span
                  >
                    {tr("common.quantityPcs", {
                      quantity: stockResult.shortage,
                    })}
                  </Text>
                }
              />
              <FieldValue
                label={tr("sales.orderLines.availableQuantityAtCheckTime")}
                value={
                  <Text className="tabular-nums" size="sm" span>
                    {tr("common.quantityPcs", {
                      quantity: stockResult.available,
                    })}
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
                    ? tr("sales.orderLines.splitIntoFromStockAndManufacture")
                    : tr("sales.orderLines.notEnoughStock")
                }
                variant="light"
              >
                <Stack gap="xs">
                  <Text size="sm">
                    {stockResult.reservedNow > 0
                      ? tr("sales.orderLineDetail.stockAllocatedSplitMessage", {
                          reserved: stockResult.reservedNow,
                          shortage: stockResult.shortage,
                        })
                      : tr("sales.orderLineDetail.shortageManufactureMessage", {
                          shortage: stockResult.shortage,
                        })}
                  </Text>
                  <Group>
                    {stockResult.reservedNow > 0 && (
                      <SecondaryButton
                        href={`/production/work-orders/new?orderLine=${order.uuid}&type=FROM_STOCK&qty=${stockResult.reservedNow}`}
                        leftSection={<IconClipboardList size={14} />}
                      >
                        {tr("sales.orderLineDetail.stockWorkOrderButton", {
                          quantity: stockResult.reservedNow,
                        })}
                      </SecondaryButton>
                    )}
                    <SecondaryButton
                      href={`/production/work-orders/new?orderLine=${order.uuid}&type=MANUFACTURE&qty=${stockResult.shortage}`}
                      leftSection={<IconClipboardList size={14} />}
                    >
                      {tr("sales.orderLineDetail.manufactureWorkOrderButton", {
                        quantity: stockResult.shortage,
                      })}
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
                    {tr("sales.orderLines.theWholeOrderedQuantityWasAllocated")}
                  </Text>
                  {stockResult.reservedNow > 0 && (
                    <Group>
                      <SecondaryButton
                        href={`/production/work-orders/new?orderLine=${order.uuid}&type=FROM_STOCK&qty=${stockResult.reservedNow}`}
                        leftSection={<IconClipboardList size={14} />}
                      >
                        {tr("sales.orderLineDetail.stockWorkOrderButton", {
                          quantity: stockResult.reservedNow,
                        })}
                      </SecondaryButton>
                    </Group>
                  )}
                </Stack>
              </Alert>
            )}
          </Stack>
        )}
      </Modal>
    </DetailShell>
  );
}
