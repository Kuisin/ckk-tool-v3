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
import { useLocale } from "next-intl";
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
  type ProcedureStage,
} from "@/components/ui/ProcedurePanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
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
  const tr = useTr();
  const stages: ProcedureStage[] = [
    {
      key: "created",
      label: tr("作成"),
      description: fmtDate(order.createdAt),
    },
    { key: "confirmed", label: tr("確定"), description: null },
    {
      key: "production",
      label: tr("製造"),
      description:
        order.workOrders.length > 0
          ? `指示書 ${order.workOrders.length} 件`
          : null,
      loading:
        order.status === "IN_PRODUCTION" || order.status === "PARTIAL_SHIPPED",
    },
    {
      key: "shipped",
      label: tr("出荷"),
      description:
        order.status === "PARTIAL_SHIPPED"
          ? `一部出荷 ${order.shippedQuantity}/${order.quantity}`
          : order.status === "SHIPPED"
            ? `${order.shippedQuantity} 本`
            : null,
    },
  ];
  const active = (() => {
    switch (order.status) {
      case "DRAFT":
        return 1;
      case "CONFIRMED":
        return 2;
      case "IN_PRODUCTION":
      case "PARTIAL_SHIPPED":
        return 3;
      case "SHIPPED":
        return stages.length;
      default:
        // CANCELLED — 進んだところまで
        return order.workOrders.length > 0 ? 3 : 1;
    }
  })();

  // 上流 = この明細が載っている注文請書と、その見積元。
  const sourceGroups: HandoffGroup[] = [
    {
      key: "acceptance",
      title: tr("注文請書"),
      items: [
        {
          key: order.acceptanceNumber,
          label: order.acceptanceNumber,
          href: `/sales/order-acceptances/${order.acceptanceNumber}`,
          note: tr("この明細の親書類"),
        },
      ],
      emptyNote: "—",
    },
    ...(order.quoteNumber
      ? [
          {
            key: "quote",
            title: tr("見積書"),
            items: [
              {
                key: order.quoteNumber,
                label: order.quoteNumber,
                href: `/sales/quotes/${order.quoteNumber}`,
                note: tr("注文請書の見積元"),
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
      title: tr("指示書（製造手配）"),
      summary: `手配済 ${allocated} / 受注 ${order.quantity} 本${
        order.reservedStockQuantity > 0
          ? `・在庫引当 ${order.reservedStockQuantity} 本`
          : ""
      }`,
      items: order.workOrders.map((w) => ({
        key: w.docNumber,
        label: w.docNumber,
        href: `/production/work-orders/${w.workOrderNumber}`,
        done: w.status === "COMPLETED",
        note: `${statusLabel("WorkOrder", w.status)}・割当 ${w.allocatedQuantity} 本`,
      })),
      emptyNote: tr("未手配（指示書なし）"),
    },
    {
      key: "delivery-orders",
      title: tr("出荷書"),
      summary: `出荷済 ${order.shippedQuantity} / 受注 ${order.quantity} 本`,
      items: order.deliveryOrders.map((s, i) => ({
        key: `${s.number}-${i}`,
        label: s.number,
        href: `/shipping/delivery-orders/${s.number}`,
        done: s.status === "SHIPPED",
        note: `${statusLabel("DeliveryOrder", s.status)}・${s.quantity} 本${s.type === "STOCK_STORAGE" ? "（在庫保管）" : ""}`,
      })),
      emptyNote: tr("未手配（出荷書なし）"),
    },
  ];

  return (
    <ProcedurePanel
      active={active}
      cancelled={order.status === "CANCELLED"}
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
  const tr = useTr();
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
    ? tr("承認依頼中のためロックされています")
    : order.status === "DRAFT"
      ? tr("注文請書の確定後に作成できます")
      : order.status === "CANCELLED"
        ? tr("キャンセル済みの明細には作成できません")
        : remainingToAllocate === 0
          ? tr("受注数量まで手配済みです")
          : order.status === "SHIPPED" || order.status === "PARTIAL_SHIPPED"
            ? tr("出荷段階の明細には作成できません")
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
    ? tr("承認依頼中のためロックされています")
    : order.status === "DRAFT"
      ? tr("注文請書の確定後に作成できます")
      : order.status === "CANCELLED"
        ? tr("キャンセル済みの明細には作成できません")
        : unshipped === 0
          ? tr("受注数量まで出荷済みです")
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
          title: tr("エラー"),
          message: tr(result.error),
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
              {tr("在庫照合")}
            </SecondaryButton>
          )}
          {/* 明細単位のキャンセルは廃止 — キャンセルは注文請書（SA24）から
              「キャンセル依頼」で承認を通す。操作は状態に依らず全て並べ、
              押せないものはグレーアウトで理由を出す。 */}
          <ResourceActions
            menuItems={[
              {
                label: tr("指示書を作成"),
                icon: <IconSettings2 size={14} />,
                disabled: !woCreatable,
                disabledReason: woDisabledReason,
                onClick: () => router.push(woCreateHref),
              },
              {
                label: tr("出荷書を作成"),
                icon: <IconTruck size={14} />,
                disabled: !doCreatable,
                disabledReason: doDisabledReason,
                onClick: () => router.push(doCreateHref),
              },
              // §10 設計依頼は受注と並行する任意の側枝なので、NextStepCard
              // （＝唯一の次の一歩）ではなくここに置く。
              {
                label: tr("設計依頼を起票"),
                icon: <IconRuler2 size={14} />,
                disabled: order.isLocked || order.status === "CANCELLED",
                disabledReason: order.isLocked
                  ? tr("承認依頼中のためロックされています")
                  : tr("キャンセル済みの明細には起票できません"),
                onClick: () => router.push(designCreateHref),
              },
            ]}
          />
        </Group>
      }
      breadcrumbs={[
        tr("販売"),
        { label: tr("注文明細"), href: BASE_PATH },
        "詳細",
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
          buttonLabel={tr("指示書を作成")}
          description={`未手配 ${remainingToAllocate} 本 — この注文明細をプリセレクトした状態で指示書ビルダーを開きます`}
          href={woCreateHref}
          icon={<IconSettings2 size={20} />}
          title={tr("次のステップ: 指示書の作成")}
        />
      ) : doCreatable ? (
        <NextStepCard
          buttonLabel={tr("出荷書を作成")}
          description={`未出荷 ${unshipped} 本 — この注文明細を読み込んだ状態で出荷書フォームを開きます`}
          href={doCreateHref}
          icon={<IconTruck size={20} />}
          title={tr("次のステップ: 出荷書の作成")}
        />
      ) : null}
      {order.isLocked && (
        <Alert
          color="orange"
          icon={<IconLock size={16} />}
          title={tr("承認依頼中ロック")}
          variant="light"
        >
          {tr(
            "この注文明細は承認依頼中のためロックされています。承認が完了するまで編集できません。",
          )}
        </Alert>
      )}

      <SummaryGrid>
        <FieldValue
          label={tr("注文明細番号")}
          value={<DocNumber>{order.orderNumber}</DocNumber>}
        />
        <FieldValue
          label={tr("顧客")}
          value={
            order.customerBranchName
              ? `${order.customerName} / ${order.customerBranchName}`
              : order.customerName
          }
        />
        <FieldValue
          label={tr("顧客注文書番号")}
          value={order.customerOrderRef ?? "—"}
        />
        <FieldValue label="製品" value={order.productName} />
        <FieldValue
          label={tr("注文種別")}
          value={
            <Badge color="gray" variant="light">
              {orderTypeLabel(order.orderType, locale) ?? order.orderType}
            </Badge>
          }
        />
        <FieldValue
          label={tr("数量")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {order.quantity} 本
            </Text>
          }
        />
        <FieldValue
          label={tr("単価")}
          value={<MoneyText ta="left" value={order.unitPrice} />}
        />
        <FieldValue
          label={tr("金額")}
          value={<MoneyText ta="left" value={order.amount} />}
        />
        <FieldValue label={tr("納期")} value={fmt.date(order.deliveryDate)} />
        <FieldValue
          label={tr("ロット番号")}
          value={
            order.lotNumber != null ? (
              <DocNumber>{order.lotNumber}</DocNumber>
            ) : (
              <Text c="dimmed" size="sm" span>
                {tr("未採番（指示書作成時に採番）")}
              </Text>
            )
          }
        />
        <FieldValue
          label={tr("見積元")}
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
        <FieldValue label={tr("最終需要家")} value={order.endUserName ?? "—"} />
        {/* 営業担当・作成者は注文請書ヘッダの値（行では編集しない）。 */}
        <FieldValue label={tr("営業担当")} value={order.salesRepName} />
        <FieldValue label={tr("作成者")} value={order.createdByName} />
        <FieldValue
          label={tr("引当済み在庫")}
          value={
            order.reservedStockQuantity > 0 ? (
              <Group gap="xs" wrap="nowrap">
                <Text className="tabular-nums" size="sm" span>
                  {order.reservedStockQuantity} / {order.quantity} 本
                </Text>
                <Badge color="orange" variant="light">
                  {tr("予約中")}
                </Badge>
              </Group>
            ) : (
              <Text c="dimmed" size="sm" span>
                {tr("未引当（在庫照合で引当）")}
              </Text>
            )
          }
        />
        <FieldValue
          label={tr("出荷済み")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {order.shippedQuantity} / {order.quantity} 本
            </Text>
          }
        />
      </SummaryGrid>

      <OrderLineProcedurePanel fmtDate={(v) => fmt.date(v)} order={order} />

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("概要")}</Tabs.Tab>
          <Tabs.Tab value="work-orders">
            指示書（{order.workOrders.length}）
          </Tabs.Tab>
          <Tabs.Tab value="shipping">
            出荷（{order.deliveryOrders.length}）
          </Tabs.Tab>
          <Tabs.Tab value="design">設計（{designRequests.length}）</Tabs.Tab>
          <Tabs.Tab value="memo">{tr("メモ")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("履歴")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("備考")}
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
                  {tr("指示書を作成")}
                </SecondaryButton>
              }
              icon={<IconClipboardList size={24} />}
              message={tr("この注文明細の指示書はまだありません")}
            />
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tr("指示書番号")}</Table.Th>
                    <Table.Th>{tr("種別")}</Table.Th>
                    <Table.Th ta="right">{tr("割当数量")}</Table.Th>
                    <Table.Th ta="right">{tr("予定数量")}</Table.Th>
                    <Table.Th>{tr("承認状態")}</Table.Th>
                    <Table.Th>{tr("状態")}</Table.Th>
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
                    {tr("出荷書を作成")}
                  </SecondaryButton>
                ) : undefined
              }
              icon={<IconTruck size={24} />}
              message={tr("この注文明細の出荷書はまだありません")}
            />
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tr("出荷書番号")}</Table.Th>
                    <Table.Th>{tr("種別")}</Table.Th>
                    <Table.Th ta="right">{tr("数量")}</Table.Th>
                    <Table.Th>{tr("状態")}</Table.Th>
                    <Table.Th>{tr("出荷日")}</Table.Th>
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
                ? tr("承認依頼中のためロックされています")
                : order.status === "CANCELLED"
                  ? tr("キャンセル済みの明細には起票できません")
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
        title={tr("在庫照合結果")}
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
                {tr("この製品の在庫レコードがありません（照合①）。")}
              </Alert>
            )}
            <Group gap="xl">
              <FieldValue
                label={tr("引当")}
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
                label={tr("不足")}
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
                label={tr("照合時の利用可能数")}
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
                    ? tr("在庫分＋製造分の分割（§4）")
                    : tr("在庫不足")
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
                    {tr("受注数量をすべて在庫から引当できました。")}
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
    </DetailShell>
  );
}
