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
import { useLocale, useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { deliveryMethodLabel, deliveryMethodOptions } from "@/lib/enum-labels";
import { statusOptions } from "@/lib/status-map";
import type { DeliveryNote } from "./model";

const BASE_PATH = "/shipping/delivery-notes";

/** 納品方法バッジ — DIRECT_TO_USER=ユーザー直送（橙）/ NORMAL=通常納品（灰）。 */
export function DeliveryMethodBadge({ method }: { method: string }) {
  const locale = useLocale();
  return (
    <Badge
      color={method === "DIRECT_TO_USER" ? "orange" : "gray"}
      variant="light"
    >
      {deliveryMethodLabel(method, locale) ?? method}
    </Badge>
  );
}

export function DeliveryNoteTable({ rows }: { rows: DeliveryNote[] }) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
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
      n.deliveryOrderNumber.includes(search) ||
      n.recipientName.includes(search) ||
      (n.endUserName ?? "").includes(search);
    const matchesMethod = !method || n.deliveryMethod === method;
    const matchesStatus = !status || n.status === status;
    return matchesSearch && matchesMethod && matchesStatus;
  });

  const columns: Column<DeliveryNote>[] = [
    {
      key: "deliveryNumber",
      header: tr("common.deliveryNoteNumber"),
      sortable: true,
      render: (n) => (
        <Text ff="mono" size="sm">
          {n.deliveryNumber}
        </Text>
      ),
    },
    {
      key: "deliveryOrderNumber",
      header: tr("common.deliveryOrderNumber"),
      sortable: true,
      render: (n) => (
        <Text ff="mono" size="sm">
          {n.deliveryOrderNumber}
        </Text>
      ),
    },
    {
      key: "recipientName",
      header: tr("common.shipTo"),
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
      header: tr("common.method2"),
      width: 130,
      sortValue: (n) => n.deliveryMethod,
      render: (n) => <DeliveryMethodBadge method={n.deliveryMethod} />,
    },
    {
      key: "status",
      header: tr("common.status"),
      width: 100,
      sortValue: (n) => n.status,
      render: (n) => <StatusBadge entity="DeliveryNote" status={n.status} />,
    },
    {
      key: "deliveredAt",
      header: tr("common.deliveredDate"),
      width: 120,
      sortValue: (n) => n.deliveredAt ?? "",
      render: (n) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(n.deliveredAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("common.shipping"), tr("common.deliveryNote")]}
      filters={
        <>
          <Select
            clearable
            data={deliveryMethodOptions(locale)}
            flex={isMobile ? 1 : undefined}
            onChange={setMethod}
            placeholder={tr("common.method2")}
            value={method}
            w={isMobile ? undefined : 150}
          />
          <Select
            clearable
            data={statusOptions("DeliveryNote")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder={tr("common.status")}
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
          placeholder={tr(
            "shipping.deliveryNotes.searchByDeliveryNoteNumberDelivery",
          )}
          value={search}
        />
      }
      title={tr("common.deliveryNote")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "deliveryNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconReceipt size={24} />}
        emptyMessage={tr("shipping.deliveryNotes.thereAreNoDeliveryNotes")}
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
                {n.deliveryOrderNumber}
                {n.endUserName
                  ? ` · ${tr("shipping.deliveryNoteTable.destinationLabel", { name: n.endUserName })}`
                  : ""}
              </Text>
              <Group gap="md" mt={2}>
                <DeliveryMethodBadge method={n.deliveryMethod} />
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="DeliveryNote" status={n.status} />
              <Text c="dimmed" size="xs">
                {fmt.date(n.deliveredAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
