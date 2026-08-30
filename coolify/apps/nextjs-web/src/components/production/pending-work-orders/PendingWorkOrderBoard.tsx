"use client";

/**
 * PendingWorkOrderBoard — 未処理指示書 (PD05, design.md §8.1 / §14).
 *
 * タブ 2 枚:
 *   未手配   — 指示書がまだ足りていない確定済み注文明細。行クリックで注文明細
 *              詳細、右端のボタンで不足分の指示書作成へ直行する。
 *   進行中   — 完了・キャンセルでない指示書。行クリックで指示書詳細。
 *
 * どちらのタブも「まだ処理が終わっていない書類」だけを出す作業キューなので、
 * 完了したものは PD02（指示書一覧）で見る。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import {
  IconClipboardList,
  IconProgress,
  IconSearch,
  IconSettings2,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type { WorkOrderRow } from "@/components/production/work-orders/model";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { QueueTabs } from "@/components/ui/QueueTabs";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import {
  useTabParam,
  useUrlSelectState,
  useUrlStringState,
} from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { workOrderTypeLabel, workOrderTypeOptions } from "@/lib/enum-labels";
import type { UnplannedOrderLineRow } from "./model";

const ORDER_LINES_PATH = "/sales/order-lines";
const WORK_ORDERS_PATH = "/production/work-orders";

/** 不足分の指示書を起こすリンク（種別と数量をプリセット）。 */
function newWorkOrderHref(r: UnplannedOrderLineRow): string {
  return `${WORK_ORDERS_PATH}/new?orderLine=${r.uuid}&type=MANUFACTURE&qty=${r.unplannedQuantity}`;
}

export function PendingWorkOrderBoard({
  unplannedRows,
  openRows,
}: {
  unplannedRows: UnplannedOrderLineRow[];
  openRows: WorkOrderRow[];
}) {
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [tab, setTab] = useTabParam("unplanned");
  const [search, setSearch] = useUrlStringState("q");
  const [type, setType] = useUrlSelectState("type");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setType(null);
    setStatus(null);
  };

  const filteredUnplanned = unplannedRows.filter((r) => {
    const matchesSearch =
      !search ||
      r.orderLineNumber.includes(search) ||
      r.customerName.includes(search) ||
      r.productName.includes(search);
    return matchesSearch && (!status || r.status === status);
  });

  const filteredOpen = openRows.filter((r) => {
    const matchesSearch =
      !search ||
      String(r.workOrderNumber).includes(search) ||
      r.docNumber.includes(search) ||
      (r.orderLineNumber ?? "").includes(search) ||
      r.productName.includes(search);
    return (
      matchesSearch &&
      (!type || r.type === type) &&
      (!status || r.status === status)
    );
  });

  const unplannedColumns: Column<UnplannedOrderLineRow>[] = [
    {
      key: "orderLineNumber",
      header: "注文明細番号",
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
      header: "顧客",
      sortable: true,
      truncate: true,
      render: (r) => r.customerName,
    },
    {
      key: "productName",
      header: "製品",
      sortable: true,
      truncate: true,
      render: (r) => r.productName,
    },
    {
      key: "quantity",
      header: "受注数",
      align: "right",
      width: 90,
      sortable: true,
      sortValue: (r) => r.quantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.quantity}
        </Text>
      ),
    },
    {
      key: "plannedQuantity",
      header: "手配済",
      align: "right",
      width: 90,
      sortable: true,
      sortValue: (r) => r.plannedQuantity,
      render: (r) => (
        <Text c="dimmed" className="tabular-nums" size="sm">
          {r.plannedQuantity}
        </Text>
      ),
    },
    {
      key: "unplannedQuantity",
      header: "未手配",
      align: "right",
      width: 100,
      sortable: true,
      sortValue: (r) => r.unplannedQuantity,
      render: (r) => (
        <Badge color="orange" variant="light">
          {r.unplannedQuantity}
        </Badge>
      ),
    },
    {
      key: "reservedStockQuantity",
      header: "在庫引当",
      align: "right",
      hideable: true,
      width: 95,
      sortable: true,
      sortValue: (r) => r.reservedStockQuantity,
      render: (r) =>
        r.reservedStockQuantity > 0 ? (
          <Text className="tabular-nums" size="sm">
            {r.reservedStockQuantity}
          </Text>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
    },
    {
      key: "deliveryDate",
      header: "納期",
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
      header: "状態",
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
          href={newWorkOrderHref(r)}
          leftSection={<IconClipboardList size={14} />}
          onClick={(e) => e.stopPropagation()}
          size="xs"
        >
          指示書作成
        </SecondaryButton>
      ),
    },
  ];

  const openColumns: Column<WorkOrderRow>[] = [
    {
      key: "workOrderNumber",
      header: "指示書番号",
      sortable: true,
      width: 150,
      sortValue: (r) => r.workOrderNumber,
      render: (r) => (
        <Text className="tabular-nums" ff="mono" size="sm">
          {r.docNumber}
        </Text>
      ),
    },
    {
      key: "orderLineNumber",
      header: "注文明細番号",
      sortable: true,
      width: 190,
      render: (r) =>
        r.orderLineNumber ? (
          <Text className="tabular-nums" ff="mono" size="sm">
            {r.orderLineNumber}
          </Text>
        ) : (
          <Badge color="teal" size="xs" variant="light">
            在庫向け
          </Badge>
        ),
    },
    {
      key: "productName",
      header: "製品",
      sortable: true,
      truncate: true,
      render: (r) => r.productName,
    },
    {
      key: "type",
      header: "種別",
      width: 100,
      sortValue: (r) => r.type,
      render: (r) => (
        <Badge
          color={r.type === "MANUFACTURE" ? "violet" : "teal"}
          size="sm"
          variant="light"
        >
          {workOrderTypeLabel(r.type, locale) ?? r.type}
        </Badge>
      ),
    },
    {
      key: "plannedQuantity",
      header: "予定数量",
      align: "right",
      width: 100,
      sortValue: (r) => r.plannedQuantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.plannedQuantity}
        </Text>
      ),
    },
    {
      key: "approvalStatus",
      header: "承認状態",
      width: 130,
      sortValue: (r) => r.approvalStatus,
      render: (r) =>
        r.approvalStatus === "NONE" ? (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ) : (
          <StatusBadge entity="WorkOrderApproval" status={r.approvalStatus} />
        ),
    },
    {
      key: "status",
      header: "状態",
      width: 110,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge entity="WorkOrder" status={r.status} />,
    },
    {
      key: "updatedAt",
      header: "更新日",
      hideable: true,
      width: 150,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {fmt.dateTime(r.updatedAt)}
        </Text>
      ),
    },
  ];

  const isUnplanned = tab === "unplanned";

  return (
    <ListShell
      breadcrumbs={["生産", "未処理指示書"]}
      filters={
        <>
          {!isUnplanned && (
            <Select
              clearable
              data={workOrderTypeOptions(locale)}
              flex={isMobile ? 1 : undefined}
              onChange={setType}
              placeholder="種別"
              value={type}
              w={isMobile ? undefined : 130}
            />
          )}
          <Select
            clearable
            data={
              isUnplanned
                ? statusOptions("OrderLine").filter((o) =>
                    ["CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"].includes(
                      o.value,
                    ),
                  )
                : statusOptions("WorkOrder").filter((o) =>
                    [
                      "DRAFT",
                      "PENDING_APPROVAL",
                      "APPROVED",
                      "IN_PROGRESS",
                    ].includes(o.value),
                  )
            }
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder="状態"
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
            isUnplanned
              ? "注文明細番号・顧客・製品で検索"
              : "指示書番号・注文明細番号・製品で検索"
          }
          value={search}
        />
      }
      title="未処理指示書"
    >
      <QueueTabs
        onChange={setTab}
        tabs={[
          {
            value: "unplanned",
            label: "未手配",
            icon: <IconClipboardList size={14} />,
            count: unplannedRows.length,
            color: "orange",
          },
          {
            value: "inflight",
            label: "進行中",
            icon: <IconProgress size={14} />,
            count: openRows.length,
          },
        ]}
        value={tab}
      >
        {isUnplanned ? (
          <DataTable
            columns={unplannedColumns}
            data={filteredUnplanned}
            defaultSort={{ key: "deliveryDate", dir: "asc" }}
            emptyIcon={<IconClipboardList size={24} />}
            emptyMessage="指示書待ちの注文明細はありません"
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
                  <Group gap="md" mt={2}>
                    <Text c="dimmed" size="xs">
                      受注 {r.quantity} 本 / 手配済 {r.plannedQuantity} 本
                    </Text>
                  </Group>
                </Stack>
                <Stack align="flex-end" className="shrink-0" gap={4}>
                  <Badge color="orange" variant="light">
                    未手配 {r.unplannedQuantity}
                  </Badge>
                  <Text c="dimmed" size="xs">
                    納期 {r.deliveryDate ? fmt.date(r.deliveryDate) : "—"}
                  </Text>
                </Stack>
              </Group>
            )}
            settingsKey="unplanned"
            urlState
          />
        ) : (
          <DataTable
            columns={openColumns}
            data={filteredOpen}
            defaultSort={{ key: "workOrderNumber", dir: "desc" }}
            emptyIcon={<IconSettings2 size={24} />}
            emptyMessage="進行中の指示書はありません"
            getRowId={(r) => String(r.workOrderNumber)}
            onRowClick={(r) =>
              router.push(`${WORK_ORDERS_PATH}/${r.docNumber}`)
            }
            renderCard={(r) => (
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack className="min-w-0" gap={3}>
                  <Text c="dimmed" ff="mono" size="xs">
                    {r.docNumber} · {r.orderLineNumber ?? "在庫向け"}
                  </Text>
                  <Text fw={600} size="sm" truncate>
                    {r.productName}
                  </Text>
                  <Text c="dimmed" size="xs">
                    予定 {r.plannedQuantity} 本
                  </Text>
                </Stack>
                <Stack align="flex-end" className="shrink-0" gap={4}>
                  <StatusBadge entity="WorkOrder" status={r.status} />
                  {r.approvalStatus !== "NONE" && (
                    <StatusBadge
                      entity="WorkOrderApproval"
                      status={r.approvalStatus}
                    />
                  )}
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
