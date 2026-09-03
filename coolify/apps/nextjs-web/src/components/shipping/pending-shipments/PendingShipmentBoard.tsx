"use client";

/**
 * PendingShipmentBoard — 未処理出荷書 (SH03, design.md §8.1 / §14).
 *
 * タブ 2 枚:
 *   未手配     — 完成分が出荷書に載っていない注文明細。行クリックで注文明細
 *                詳細、右端のボタンでその明細を選んだ状態の出荷書作成へ直行。
 *   出荷準備中 — まだ SHIPPED になっていない出荷書。行クリックで出荷書詳細。
 *
 * 出荷済みの出荷書は SH01（出荷書一覧）で見る — ここは作業キューに徹する。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch, IconTruck, IconTruckLoading } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DeliveryOrderTypeBadge } from "@/components/shipping/delivery-orders/DeliveryOrderTable";
import type { DeliveryOrder } from "@/components/shipping/delivery-orders/model";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { QueueTabs } from "@/components/ui/QueueTabs";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import {
  useTabParam,
  useUrlSelectState,
  useUrlStringState,
} from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { deliveryOrderTypeOptions } from "@/lib/enum-labels";
import { statusOptions } from "@/lib/status-map";
import type { UnshippedOrderLineRow } from "./model";

const ORDER_LINES_PATH = "/sales/order-lines";
const DELIVERY_ORDERS_PATH = "/shipping/delivery-orders";

export function PendingShipmentBoard({
  unshippedRows,
  openRows,
}: {
  unshippedRows: UnshippedOrderLineRow[];
  openRows: DeliveryOrder[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [tab, setTab] = useTabParam("unshipped");
  const [search, setSearch] = useUrlStringState("q");
  const [type, setType] = useUrlSelectState("type");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setType(null);
    setStatus(null);
  };

  const filteredUnshipped = unshippedRows.filter((r) => {
    const matchesSearch =
      !search ||
      r.orderLineNumber.includes(search) ||
      r.customerName.includes(search) ||
      r.productName.includes(search) ||
      r.completedLots.some((lot) => String(lot).includes(search));
    return matchesSearch && (!status || r.status === status);
  });

  const filteredOpen = openRows.filter((o) => {
    const matchesSearch =
      !search ||
      o.deliveryOrderNumber.includes(search) ||
      o.orderLineNumbers.some((n) => n.includes(search)) ||
      o.customerName.includes(search);
    return (
      matchesSearch &&
      (!type || o.type === type) &&
      (!status || o.status === status)
    );
  });

  const unshippedColumns: Column<UnshippedOrderLineRow>[] = [
    {
      key: "orderLineNumber",
      header: tr("common.orderLineNumber"),
      sortable: true,
      width: 190,
      render: (r) => (
        <Text className="tabular-nums" ff="mono" size="sm">
          {r.orderLineNumber}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: tr("common.customer"),
      sortable: true,
      truncate: true,
      render: (r) => r.customerName,
    },
    {
      key: "productName",
      header: tr("common.product"),
      sortable: true,
      truncate: true,
      render: (r) => r.productName,
    },
    {
      key: "completedLots",
      header: tr("shipping.pendingShipments.completedLots"),
      hideable: true,
      width: 140,
      sortValue: (r) => r.completedLots.length,
      render: (r) => (
        <Text c="dimmed" className="tabular-nums" ff="mono" size="xs">
          {r.completedLots.map((lot) => `#${lot}`).join(", ") || "—"}
        </Text>
      ),
    },
    {
      key: "finishedQuantity",
      header: tr("shipping.pendingShipments.finishedQuantity"),
      align: "right",
      width: 90,
      sortable: true,
      sortValue: (r) => r.finishedQuantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.finishedQuantity}
        </Text>
      ),
    },
    {
      key: "shippedQuantity",
      header: tr("shipping.pendingShipments.shipmentPlanned"),
      align: "right",
      width: 105,
      sortable: true,
      sortValue: (r) => r.shippedQuantity,
      render: (r) => (
        <Text c="dimmed" className="tabular-nums" size="sm">
          {r.shippedQuantity}
        </Text>
      ),
    },
    {
      key: "unshippedQuantity",
      header: tr("common.notPlanned"),
      align: "right",
      width: 100,
      sortable: true,
      sortValue: (r) => r.unshippedQuantity,
      render: (r) => (
        <Badge color="orange" variant="light">
          {r.unshippedQuantity}
        </Badge>
      ),
    },
    {
      key: "deliveryDate",
      header: tr("common.deliveryDate"),
      width: 110,
      sortable: true,
      sortValue: (r) => r.deliveryDate ?? "",
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.deliveryDate ? fmt.date(r.deliveryDate) : "—"}
        </Text>
      ),
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 110,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge entity="OrderLine" status={r.status} />,
    },
    {
      key: "actions",
      header: "",
      width: 130,
      render: (r) => (
        <SecondaryButton
          href={`${DELIVERY_ORDERS_PATH}/new?orderLine=${r.uuid}`}
          leftSection={<IconTruck size={14} />}
          onClick={(e) => e.stopPropagation()}
          size="xs"
        >
          {tr("shipping.pendingShipments.createADeliveryOrder")}
        </SecondaryButton>
      ),
    },
  ];

  const openColumns: Column<DeliveryOrder>[] = [
    {
      key: "deliveryOrderNumber",
      header: tr("common.deliveryOrderNumber"),
      sortable: true,
      width: 170,
      render: (o) => (
        <Text ff="mono" size="sm">
          {o.deliveryOrderNumber}
        </Text>
      ),
    },
    {
      key: "customerName",
      header: tr("common.customerOrderLine"),
      sortable: true,
      render: (o) => (
        <>
          <Text size="sm">{o.customerName}</Text>
          <Text c="dimmed" ff="mono" size="xs">
            {o.orderLineNumbers.join(", ") || "—"}
          </Text>
        </>
      ),
    },
    {
      key: "type",
      header: tr("common.type2"),
      width: 110,
      sortValue: (o) => o.type,
      render: (o) => <DeliveryOrderTypeBadge type={o.type} />,
    },
    {
      key: "totalQuantity",
      header: tr("common.totalQuantity"),
      align: "right",
      width: 100,
      sortValue: (o) => o.totalQuantity,
      render: (o) => (
        <Text className="tabular-nums" size="sm">
          {o.totalQuantity}
        </Text>
      ),
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 100,
      sortValue: (o) => o.status,
      render: (o) => <StatusBadge entity="DeliveryOrder" status={o.status} />,
    },
    {
      key: "updatedAt",
      header: tr("common.updated"),
      hideable: true,
      width: 150,
      sortValue: (o) => o.updatedAt,
      render: (o) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {fmt.dateTime(o.updatedAt)}
        </Text>
      ),
    },
  ];

  const isUnshipped = tab === "unshipped";

  return (
    <ListShell
      breadcrumbs={[
        tr("common.shipping"),
        tr("shipping.pendingShipments.pendingShipments"),
      ]}
      filters={
        <>
          {!isUnshipped && (
            <Select
              clearable
              data={deliveryOrderTypeOptions(locale)}
              flex={isMobile ? 1 : undefined}
              onChange={setType}
              placeholder={tr("common.type2")}
              value={type}
              w={isMobile ? undefined : 130}
            />
          )}
          <Select
            clearable
            data={
              isUnshipped
                ? statusOptions("OrderLine").filter((o) =>
                    ["CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"].includes(
                      o.value,
                    ),
                  )
                : statusOptions("DeliveryOrder").filter((o) =>
                    ["DRAFT", "CONFIRMED"].includes(o.value),
                  )
            }
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder={tr("common.status")}
            value={status}
            w={isMobile ? undefined : 150}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={
            isUnshipped
              ? tr("shipping.pendingShipments.searchByOrderLineNumberCustomer")
              : tr("shipping.pendingShipments.searchByDeliveryOrderNumberOrder")
          }
          value={search}
        />
      }
      title={tr("shipping.pendingShipments.pendingShipments")}
    >
      <QueueTabs
        onChange={setTab}
        tabs={[
          {
            value: "unshipped",
            label: tr("common.notPlanned"),
            icon: <IconTruckLoading size={14} />,
            count: unshippedRows.length,
            color: "orange",
          },
          {
            value: "inflight",
            label: tr("shipping.pendingShipments.preparingToShip"),
            icon: <IconTruck size={14} />,
            count: openRows.length,
          },
        ]}
        value={tab}
      >
        {isUnshipped ? (
          <DataTable
            columns={unshippedColumns}
            data={filteredUnshipped}
            defaultSort={{ key: "deliveryDate", dir: "asc" }}
            emptyIcon={<IconTruckLoading size={24} />}
            emptyMessage={tr(
              "shipping.pendingShipments.thereAreNoOrderLinesAwaiting",
            )}
            getRowId={(r) => r.id}
            onRowClick={(r) => router.push(`${ORDER_LINES_PATH}/${r.id}`)}
            renderCard={(r) => (
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack className="min-w-0" gap={3}>
                  <Text c="dimmed" ff="mono" size="xs">
                    {r.orderLineNumber}
                  </Text>
                  <Text fw={600} size="sm" truncate>
                    {r.customerName}
                  </Text>
                  <Text c="dimmed" size="xs" truncate>
                    {r.productName}
                  </Text>
                  <Text c="dimmed" size="xs">
                    完成 {r.finishedQuantity} 本 / 手配済 {r.shippedQuantity} 本
                  </Text>
                </Stack>
                <Stack align="flex-end" className="shrink-0" gap={4}>
                  <Badge color="orange" variant="light">
                    未手配 {r.unshippedQuantity}
                  </Badge>
                  <Text c="dimmed" size="xs">
                    納期 {r.deliveryDate ? fmt.date(r.deliveryDate) : "—"}
                  </Text>
                </Stack>
              </Group>
            )}
            settingsKey="unshipped"
            urlState
          />
        ) : (
          <DataTable
            columns={openColumns}
            data={filteredOpen}
            defaultSort={{ key: "deliveryOrderNumber", dir: "desc" }}
            emptyIcon={<IconTruck size={24} />}
            emptyMessage={tr(
              "shipping.pendingShipments.thereAreNoDeliveryOrdersBeing",
            )}
            getRowId={(o) => o.id}
            onRowClick={(o) => router.push(`${DELIVERY_ORDERS_PATH}/${o.id}`)}
            renderCard={(o) => (
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack className="min-w-0" gap={3}>
                  <Text c="dimmed" ff="mono" size="xs">
                    {o.deliveryOrderNumber}
                  </Text>
                  <Text fw={600} size="sm" truncate>
                    {o.customerName}
                  </Text>
                  <Text c="dimmed" ff="mono" size="xs" truncate>
                    {o.orderLineNumbers.join(", ") || "—"}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {o.totalQuantity} 本
                  </Text>
                </Stack>
                <Stack align="flex-end" className="shrink-0" gap={4}>
                  <StatusBadge entity="DeliveryOrder" status={o.status} />
                  <DeliveryOrderTypeBadge type={o.type} />
                </Stack>
              </Group>
            )}
            settingsKey="open"
            urlState
          />
        )}
      </QueueTabs>
    </ListShell>
  );
}
