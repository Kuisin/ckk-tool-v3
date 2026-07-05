"use client";

/**
 * TrialEstimateTable — 試算 一覧 (SA50). One row per saved 試算 record.
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import {
  IconCalculator,
  IconCopy,
  IconCurrencyYen,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { MoneyText } from "@/components/ui/MoneyText";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDateTime } from "@/lib/format";
import type { Option } from "@/lib/mock";
import { calcTrialPricing, TOOL_TYPE_OPTIONS } from "@/lib/trial-pricing";
import { ConvertToPriceListModal } from "./ConvertToPriceListModal";
import type { ExistingEntryRef, TrialEstimateRecord } from "./types";

const BASE_PATH = "/sales/trial-estimates";

const toolLabel = (v: string) =>
  TOOL_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;

/** Representative 見積単価 = first lot tier. */
const headlinePrice = (r: TrialEstimateRecord) =>
  calcTrialPricing(r.input).lots[0]?.estimateUnitPrice ?? 0;

export function TrialEstimateTable({
  rows,
  customerOptions,
  productOptions,
  existingEntries,
}: {
  rows: TrialEstimateRecord[];
  customerOptions: Option[];
  productOptions: Option[];
  existingEntries: ExistingEntryRef[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [toolType, setToolType] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // 価格表に登録 modal target (null = closed).
  const [registerTarget, setRegisterTarget] =
    useState<TrialEstimateRecord | null>(null);

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.name.includes(search) ||
      r.estimateNumber.includes(search) ||
      (r.customerName ?? "").includes(search);
    const matchesTool = !toolType || r.input.toolType === toolType;
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesTool && matchesStatus;
  });

  const columns: Column<TrialEstimateRecord>[] = [
    {
      key: "estimateNumber",
      header: "試算番号",
      width: 170,
      sortable: true,
      sortValue: (r) => r.estimateNumber,
      render: (r) => <DocNumber>{r.estimateNumber}</DocNumber>,
    },
    {
      key: "name",
      header: "名称",
      sortable: true,
      render: (r) => (
        <Group gap="xs" wrap="nowrap">
          <Text size="sm">{r.name}</Text>
          {r.isCustomPrice && (
            <Badge color="orange" size="xs" variant="light">
              カスタム
            </Badge>
          )}
        </Group>
      ),
    },
    {
      key: "customer",
      header: "顧客",
      hideable: true,
      render: (r) => r.customerName ?? "—",
    },
    {
      key: "toolType",
      header: "工具種",
      width: 100,
      render: (r) => (
        <Badge color="gray" variant="light">
          {toolLabel(r.input.toolType)}
        </Badge>
      ),
    },
    {
      key: "material",
      header: "素材",
      hideable: true,
      render: (r) => (
        <Text ff="mono" size="xs">
          {r.materialId}
        </Text>
      ),
    },
    {
      key: "price",
      header: "代表見積単価",
      align: "right",
      width: 140,
      sortValue: (r) => headlinePrice(r),
      render: (r) => (
        <Text fw={600} size="sm" ta="right">
          <MoneyText value={headlinePrice(r)} />
        </Text>
      ),
    },
    {
      key: "status",
      header: "状態",
      width: 130,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge entity="Estimate" status={r.status} />,
    },
    {
      key: "updatedAt",
      header: "更新日",
      width: 150,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {formatDateTime(r.updatedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={
        <Group gap="xs">
          <SecondaryButton
            href="/settings"
            leftSection={<IconSettings size={16} />}
          >
            設定
          </SecondaryButton>
          <NewButton href={`${BASE_PATH}/new`} />
        </Group>
      }
      breadcrumbs={["販売", "試算"]}
      filters={
        <>
          <Select
            clearable
            data={statusOptions("Estimate")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder="状態"
            value={status}
            w={isMobile ? undefined : 150}
          />
          <Select
            clearable
            data={TOOL_TYPE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            flex={isMobile ? 1 : undefined}
            onChange={setToolType}
            placeholder="工具種"
            value={toolType}
            w={isMobile ? undefined : 140}
          />
        </>
      }
      onReset={() => {
        setSearch("");
        setToolType(null);
        setStatus(null);
      }}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="試算番号・名称・顧客で検索"
          value={search}
        />
      }
      title="試算"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconCalculator size={24} />}
        emptyMessage="試算がありません"
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {r.estimateNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {r.name}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {r.customerName ?? "—"}
              </Text>
              <Group gap="xs">
                <Badge color="gray" size="xs" variant="light">
                  {toolLabel(r.input.toolType)}
                </Badge>
                {r.isCustomPrice && (
                  <Badge color="orange" size="xs" variant="light">
                    カスタム
                  </Badge>
                )}
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="Estimate" size="xs" status={r.status} />
              <Text fw={700} size="sm">
                <MoneyText value={headlinePrice(r)} />
              </Text>
              <Text c="dimmed" size="xs">
                {formatDateTime(r.updatedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        rowActions={(r) => [
          ...(r.status === "CONFIRMED"
            ? [
                {
                  label: "価格表に登録",
                  icon: <IconCurrencyYen size={14} />,
                  onAction: () => setRegisterTarget(r),
                },
              ]
            : []),
          {
            label: "複製して再試算",
            icon: <IconCopy size={14} />,
            onAction: (row) => router.push(`${BASE_PATH}/new?from=${row.id}`),
          },
        ]}
      />

      <ConvertToPriceListModal
        customerOptions={customerOptions}
        estimate={registerTarget}
        existingEntries={existingEntries}
        onClose={() => setRegisterTarget(null)}
        onRegistered={() => router.refresh()}
        opened={registerTarget !== null}
        productOptions={productOptions}
      />
    </ListShell>
  );
}
