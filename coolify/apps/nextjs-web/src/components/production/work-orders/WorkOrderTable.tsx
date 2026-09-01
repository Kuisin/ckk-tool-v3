"use client";

/**
 * WorkOrderTable — 指示書 一覧 (PD02) / 承認依頼中一覧 (PD03) (design.md §8.1/§14).
 *
 * variant="workOrders": 指示書番号 / 注文明細番号 / 製品 / 種別 / 予定数量 /
 *   承認状態（NONE は非表示）/ 状態 / 更新日。行クリック → 指示書詳細。
 * variant="approvals": 承認状態が PENDING の行のみ（server 側で絞り込み済み）。
 *   状態・更新日の代わりに依頼日。行クリック → 承認詳細。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import {
  IconSearch,
  IconSettings2,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { workOrderTypeLabel, workOrderTypeOptions } from "@/lib/enum-labels";
import { statusOptions } from "@/lib/status-map";
import type { WorkOrderRow } from "./model";

const WORK_ORDERS_PATH = "/production/work-orders";
const APPROVALS_PATH = "/production/approvals";

function TypeBadge({ type }: { type: string }) {
  const locale = useLocale();
  return (
    <Badge
      color={type === "MANUFACTURE" ? "violet" : "teal"}
      size="sm"
      variant="light"
    >
      {workOrderTypeLabel(type, locale) ?? type}
    </Badge>
  );
}

export function WorkOrderTable({
  rows,
  variant = "workOrders",
}: {
  rows: WorkOrderRow[];
  variant?: "workOrders" | "approvals";
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const isApprovals = variant === "approvals";
  const basePath = isApprovals ? APPROVALS_PATH : WORK_ORDERS_PATH;

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [type, setType] = useUrlSelectState("type");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setType(null);
    setStatus(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      String(r.workOrderNumber).includes(search) ||
      r.docNumber.includes(search) ||
      (r.orderLineNumber ?? "").includes(search) ||
      r.productName.includes(search);
    const matchesType = !type || r.type === type;
    const matchesStatus =
      !status || (isApprovals ? r.approvalStatus : r.status) === status;
    return matchesSearch && matchesType && matchesStatus;
  });

  const columns: Column<WorkOrderRow>[] = [
    {
      key: "workOrderNumber",
      header: tr("common.workOrderNumber"),
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
      header: tr("common.orderLineNumber"),
      sortable: true,
      width: 190,
      render: (r) =>
        r.orderLineNumber ? (
          <Text className="tabular-nums" ff="mono" size="sm">
            {r.orderLineNumber}
          </Text>
        ) : (
          <Badge color="teal" size="xs" variant="light">
            {tr("common.forStock")}
          </Badge>
        ),
    },
    {
      key: "productName",
      header: "製品",
      sortable: true,
      render: (r) => r.productName,
    },
    {
      key: "type",
      header: tr("common.type2"),
      width: 100,
      sortValue: (r) => r.type,
      render: (r) => <TypeBadge type={r.type} />,
    },
    {
      key: "plannedQuantity",
      header: tr("common.plannedQuantity"),
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
      header: tr("common.approvalStatus"),
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
    ...(isApprovals
      ? [
          {
            key: "requestedAt",
            header: tr("common.requestedDate"),
            width: 130,
            sortValue: (r) => r.requestedAt ?? "",
            render: (r) => (
              <Text className="tabular-nums" size="sm">
                {fmt.date(r.requestedAt)}
              </Text>
            ),
          } satisfies Column<WorkOrderRow>,
        ]
      : [
          {
            key: "status",
            header: tr("common.status"),
            width: 110,
            sortValue: (r) => r.status,
            render: (r) => <StatusBadge entity="WorkOrder" status={r.status} />,
          } satisfies Column<WorkOrderRow>,
          {
            key: "updatedAt",
            header: tr("common.updated"),
            hideable: true,
            width: 150,
            sortValue: (r) => r.updatedAt,
            render: (r) => (
              <Text c="dimmed" className="tabular-nums" size="xs">
                {fmt.dateTime(r.updatedAt)}
              </Text>
            ),
          } satisfies Column<WorkOrderRow>,
        ]),
  ];

  return (
    <ListShell
      action={
        isApprovals ? undefined : <NewButton href={`${WORK_ORDERS_PATH}/new`} />
      }
      breadcrumbs={[
        tr("common.production"),
        isApprovals ? "承認管理" : tr("common.workOrder"),
      ]}
      filters={
        <>
          <Select
            clearable
            data={workOrderTypeOptions(locale)}
            flex={isMobile ? 1 : undefined}
            onChange={setType}
            placeholder={tr("common.type2")}
            value={type}
            w={isMobile ? undefined : 130}
          />
          <Select
            clearable
            data={
              isApprovals
                ? statusOptions("WorkOrderApproval").filter((o) =>
                    ["PENDING"].includes(o.value),
                  )
                : statusOptions("WorkOrder")
            }
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder={isApprovals ? "承認状態" : tr("common.status")}
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
          placeholder={tr("common.searchByWorkOrderNumberOrder")}
          value={search}
        />
      }
      title={isApprovals ? "承認管理" : tr("common.workOrder")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={
          isApprovals
            ? { key: "requestedAt", dir: "asc" }
            : { key: "workOrderNumber", dir: "desc" }
        }
        emptyAction={
          isApprovals ? undefined : (
            <NewButton href={`${WORK_ORDERS_PATH}/new`} />
          )
        }
        emptyIcon={
          isApprovals ? (
            <IconShieldCheck size={24} />
          ) : (
            <IconSettings2 size={24} />
          )
        }
        emptyMessage={
          isApprovals
            ? tr("production.workOrders.thereAreNoWorkOrdersPending")
            : tr("production.workOrders.thereAreNoWorkOrders")
        }
        getRowId={(r) => String(r.workOrderNumber)}
        onRowClick={(r) => router.push(`${basePath}/${r.docNumber}`)}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {r.docNumber} · {r.orderLineNumber ?? tr("common.forStock")}
              </Text>
              <Text fw={600} size="sm" truncate>
                {r.productName}
              </Text>
              <Group gap="md" mt={2}>
                <TypeBadge type={r.type} />
                <Text c="dimmed" size="xs">
                  {r.plannedQuantity} 本
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              {isApprovals ? (
                <>
                  <StatusBadge
                    entity="WorkOrderApproval"
                    status={r.approvalStatus}
                  />
                  <Text c="dimmed" size="xs">
                    依頼 {fmt.date(r.requestedAt)}
                  </Text>
                </>
              ) : (
                <>
                  <StatusBadge entity="WorkOrder" status={r.status} />
                  {r.approvalStatus !== "NONE" && (
                    <StatusBadge
                      entity="WorkOrderApproval"
                      status={r.approvalStatus}
                    />
                  )}
                </>
              )}
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
