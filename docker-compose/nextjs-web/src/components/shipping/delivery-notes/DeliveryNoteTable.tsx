"use client";

/**
 * DeliveryNoteTable — 納品書 一覧 (SH02, design.md §8.1 / §14).
 *
 * Columns: 納品番号 / 出荷書番号 / 納品先 / 方法 / 状態 / 納品日。
 * フィルタ: 検索（番号・納品先）+ 方法 + 状態。行クリック → 詳細。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconReceipt, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  DELIVERY_METHOD_LABEL,
  DELIVERY_METHOD_OPTIONS,
} from "@/lib/enum-labels";
import { formatDate } from "@/lib/format";
import type { DeliveryNote } from "./model";

const BASE_PATH = "/shipping/delivery-notes";

/** 納品方法バッジ — DIRECT_TO_USER=ユーザー直送（橙）/ NORMAL=通常納品（灰）。 */
export function DeliveryMethodBadge({ method }: { method: string }) {
  return (
    <Badge
      color={method === "DIRECT_TO_USER" ? "orange" : "gray"}
      variant="light"
    >
      {DELIVERY_METHOD_LABEL[method] ?? method}
    </Badge>
  );
}

export function DeliveryNoteTable({ rows }: { rows: DeliveryNote[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [method, setMethod] = useUrlSelectState("method");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setMethod(null);
    setStatus(null);
  };

  const filtered = rows.filter((n) => {
    const matchesSearch =
      !search ||
      n.deliveryNumber.includes(search) ||
      n.shippingOrderNumber.includes(search) ||
      n.recipientName.includes(search) ||
      (n.endUserName ?? "").includes(search);
    const matchesMethod = !method || n.deliveryMethod === method;
    const matchesStatus = !status || n.status === status;
    return matchesSearch && matchesMethod && matchesStatus;
  });

  const columns: Column<DeliveryNote>[] = [
    {
      key: "deliveryNumber",
      header: "納品番号",
      sortable: true,
      render: (n) => (
        <Text ff="mono" size="sm">
          {n.deliveryNumber}
        </Text>
      ),
    },
    {
      key: "shippingOrderNumber",
      header: "出荷書番号",
      sortable: true,
      render: (n) => (
        <Text ff="mono" size="sm">
          {n.shippingOrderNumber}
        </Text>
      ),
    },
    {
      key: "recipientName",
      header: "納品先",
      sortable: true,
      render: (n) => (
        <>
          <Text size="sm">
            {n.recipientBranchName
              ? `${n.recipientName} / ${n.recipientBranchName}`
              : n.recipientName}
          </Text>
          {n.endUserName && (
            <Text c="dimmed" size="xs">
              届け先: {n.endUserName}
            </Text>
          )}
        </>
      ),
    },
    {
      key: "deliveryMethod",
      header: "方法",
      width: 130,
      sortValue: (n) => n.deliveryMethod,
      render: (n) => <DeliveryMethodBadge method={n.deliveryMethod} />,
    },
    {
      key: "status",
      header: "状態",
      width: 100,
      sortValue: (n) => n.status,
      render: (n) => <StatusBadge entity="DeliveryNote" status={n.status} />,
    },
    {
      key: "deliveredAt",
      header: "納品日",
      width: 120,
      sortValue: (n) => n.deliveredAt ?? "",
      render: (n) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(n.deliveredAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["出荷", "納品書"]}
      filters={
        <>
          <Select
            clearable
            data={DELIVERY_METHOD_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setMethod}
            placeholder="方法"
            value={method}
            w={isMobile ? undefined : 150}
          />
          <Select
            clearable
            data={statusOptions("DeliveryNote")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder="状態"
            value={status}
            w={isMobile ? undefined : 140}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="納品番号・出荷書番号・納品先で検索"
          value={search}
        />
      }
      title="納品書"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "deliveryNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconReceipt size={24} />}
        emptyMessage="納品書がありません"
        getRowId={(n) => n.id}
        onRowClick={(n) => router.push(`${BASE_PATH}/${n.id}`)}
        renderCard={(n) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {n.deliveryNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {n.recipientName}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {n.shippingOrderNumber}
                {n.endUserName ? ` · 届け先: ${n.endUserName}` : ""}
              </Text>
              <Group gap="md" mt={2}>
                <DeliveryMethodBadge method={n.deliveryMethod} />
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="DeliveryNote" status={n.status} />
              <Text c="dimmed" size="xs">
                {formatDate(n.deliveredAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
