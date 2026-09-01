"use client";

/**
 * TrialEstimateTable — 価格試算 一覧 (SA50). One row per saved 価格試算 record.
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import {
  IconCalculator,
  IconCopy,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { MoneyText } from "@/components/ui/MoneyText";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  calcTrialPricing,
  TOOL_TYPE_OPTIONS,
  type TrialPricingOptions,
} from "@/lib/trial-pricing";
import type { TrialEstimateRecord } from "./types";

const BASE_PATH = "/sales/trial-estimates";

/** Representative 見積単価 = first lot tier. 記録済みスナップショットを優先。 */
const headlinePrice = (r: TrialEstimateRecord, opts: TrialPricingOptions) =>
  (r.resultSnapshot ?? calcTrialPricing(r.input, opts)).lots[0]
    ?.estimateUnitPrice ?? 0;

export function TrialEstimateTable({
  rows,
  pricingOptions = {},
  toolTypeOptions = TOOL_TYPE_OPTIONS,
}: {
  rows: TrialEstimateRecord[];
  /** 価格試算エンジンのオプション（係数・カスタム計算）— 画面間で単価を一致させる。 */
  pricingOptions?: TrialPricingOptions;
  /** 工具種の選択肢（管理者定義。未指定は組み込み 3 種）. */
  toolTypeOptions?: { value: string; label: string }[];
}) {
  const tr = useTr();
  const fmt = useFormat();
  const toolLabel = (v: string) =>
    toolTypeOptions.find((o) => o.value === v)?.label ?? v;
  const router = useRouter();
  const isMobile = useIsMobile();
  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [toolType, setToolType] = useUrlSelectState("toolType");
  const [status, setStatus] = useUrlSelectState("status");
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
      header: tr("価格試算番号"),
      width: 170,
      sortable: true,
      sortValue: (r) => r.estimateNumber,
      render: (r) => <DocNumber>{r.estimateNumber}</DocNumber>,
    },
    {
      key: "name",
      header: tr("名称"),
      sortable: true,
      render: (r) => (
        <Group gap="xs" wrap="nowrap">
          <Text size="sm">{r.name}</Text>
          {r.isCustomPrice && (
            <Badge color="orange" size="xs" variant="light">
              {tr("カスタム")}
            </Badge>
          )}
        </Group>
      ),
    },
    {
      key: "customer",
      header: tr("顧客"),
      hideable: true,
      render: (r) => r.customerName ?? "—",
    },
    {
      key: "toolType",
      header: tr("工具種"),
      width: 100,
      render: (r) => (
        <Badge color="gray" variant="light">
          {toolLabel(r.input.toolType)}
        </Badge>
      ),
    },
    {
      key: "material",
      header: tr("材種"),
      hideable: true,
      render: (r) => <Text size="xs">{r.materialLabel}</Text>,
    },
    {
      key: "price",
      header: tr("代表見積単価"),
      align: "right",
      width: 140,
      sortValue: (r) => headlinePrice(r, pricingOptions),
      render: (r) => (
        <Text fw={600} size="sm" ta="right">
          <MoneyText value={headlinePrice(r, pricingOptions)} />
        </Text>
      ),
    },
    {
      key: "status",
      header: tr("状態"),
      width: 130,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge entity="Estimate" status={r.status} />,
    },
    {
      key: "updatedAt",
      header: tr("更新日"),
      width: 150,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {fmt.dateTime(r.updatedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={
        <Group gap="xs">
          <SecondaryButton
            href="/settings/apps/trial-estimate"
            leftSection={<IconSettings size={16} />}
          >
            {tr("設定")}
          </SecondaryButton>
          <NewButton href={`${BASE_PATH}/new`} />
        </Group>
      }
      breadcrumbs={[tr("販売"), tr("価格試算")]}
      filters={
        <>
          <Select
            clearable
            data={statusOptions("Estimate")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder={tr("状態")}
            value={status}
            w={isMobile ? undefined : 150}
          />
          <Select
            clearable
            data={toolTypeOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setToolType}
            placeholder={tr("工具種")}
            value={toolType}
            w={isMobile ? undefined : 140}
          />
        </>
      }
      onReset={() => {
        setSearch(null);
        setToolType(null);
        setStatus(null);
      }}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("価格試算番号・名称・顧客で検索")}
          value={search}
        />
      }
      title={tr("価格試算")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconCalculator size={24} />}
        emptyMessage={tr("価格試算がありません")}
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
                    {tr("カスタム")}
                  </Badge>
                )}
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="Estimate" size="xs" status={r.status} />
              <Text fw={700} size="sm">
                <MoneyText value={headlinePrice(r, pricingOptions)} />
              </Text>
              <Text c="dimmed" size="xs">
                {fmt.dateTime(r.updatedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        rowActions={() => [
          {
            label: tr("複製して再価格試算"),
            icon: <IconCopy size={14} />,
            onAction: (row) => router.push(`${BASE_PATH}/new?from=${row.id}`),
          },
        ]}
        urlState
      />
    </ListShell>
  );
}
