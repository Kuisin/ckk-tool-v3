"use client";

/**
 * ApprovalRequestTable — 承認管理 一覧 (PD03, design.md §8.1/§14)。
 *
 * PENDING の承認依頼（approval_requests + 旧データ補完）を対象種別横断で表示:
 * 種別（指示書=violet / 素材発注書=teal / 受注請書=blue）/ 対象番号（mono、
 * 対象詳細へリンク）/ 段階（第一/第二）/ 依頼者 / 依頼日時 / 備考。
 * 受注請書の承認画面は未実装のためリンクなし。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch, IconShieldCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApprovalRequestRow } from "@/app/(dashboard)/production/approvals/data";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDateTime } from "@/lib/format";

const TARGET_TYPE_LABEL: Record<string, string> = {
  work_orders: "指示書",
  material_purchase_orders: "素材発注書",
  order_acceptances: "受注請書",
};

const TARGET_TYPE_COLOR: Record<string, string> = {
  work_orders: "violet",
  material_purchase_orders: "teal",
  order_acceptances: "blue",
};

const STEP_LABEL: Record<string, string> = {
  FIRST: "第一",
  SECOND: "第二",
};

// design.md §9 の承認待ち配色に合わせる（第一=yellow / 第二=orange）
const STEP_COLOR: Record<string, string> = {
  FIRST: "yellow",
  SECOND: "orange",
};

const TARGET_TYPE_OPTIONS = Object.entries(TARGET_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

const STEP_OPTIONS = [
  { value: "FIRST", label: "第一承認" },
  { value: "SECOND", label: "第二承認" },
];

/** 対象種別ごとの詳細画面パス（受注請書は未実装 = null）。 */
function targetHref(row: ApprovalRequestRow): string | null {
  switch (row.targetType) {
    case "work_orders":
      return `/production/work-orders/${row.targetId}`;
    case "material_purchase_orders":
      return `/purchase/purchase-orders/${encodeURIComponent(row.targetId)}`;
    default:
      return null; // order_acceptances — 承認画面未実装
  }
}

function targetLabel(row: ApprovalRequestRow): string {
  return row.targetType === "work_orders" ? `#${row.targetId}` : row.targetId;
}

function TargetTypeBadge({ targetType }: { targetType: string }) {
  return (
    <Badge
      color={TARGET_TYPE_COLOR[targetType] ?? "gray"}
      size="sm"
      variant="light"
    >
      {TARGET_TYPE_LABEL[targetType] ?? targetType}
    </Badge>
  );
}

function StepBadge({ step }: { step: string }) {
  return (
    <Badge color={STEP_COLOR[step] ?? "gray"} size="sm" variant="light">
      {STEP_LABEL[step] ?? step}
    </Badge>
  );
}

export function ApprovalRequestTable({ rows }: { rows: ApprovalRequestRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [targetType, setTargetType] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  const reset = () => {
    setSearch("");
    setTargetType(null);
    setStep(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.targetId.includes(search) ||
      r.requestedBy.includes(search) ||
      (r.notes ?? "").includes(search);
    const matchesType = !targetType || r.targetType === targetType;
    const matchesStep = !step || r.step === step;
    return matchesSearch && matchesType && matchesStep;
  });

  const columns: Column<ApprovalRequestRow>[] = [
    {
      key: "targetType",
      header: "種別",
      width: 120,
      sortable: true,
      sortValue: (r) => r.targetType,
      render: (r) => <TargetTypeBadge targetType={r.targetType} />,
    },
    {
      key: "targetId",
      header: "対象番号",
      sortable: true,
      width: 180,
      sortValue: (r) => r.targetId,
      render: (r) => (
        <Group gap="xs" wrap="nowrap">
          <Text className="tabular-nums" ff="mono" size="sm">
            {targetLabel(r)}
          </Text>
          {r.isLegacy && (
            <Badge color="gray" size="xs" variant="outline">
              旧データ
            </Badge>
          )}
        </Group>
      ),
    },
    {
      key: "step",
      header: "段階",
      width: 90,
      sortable: true,
      sortValue: (r) => r.step,
      render: (r) => <StepBadge step={r.step} />,
    },
    {
      key: "requestedBy",
      header: "依頼者",
      sortable: true,
      width: 160,
      render: (r) => <Text size="sm">{r.requestedBy}</Text>,
    },
    {
      key: "requestedAt",
      header: "依頼日時",
      sortable: true,
      width: 150,
      sortValue: (r) => r.requestedAt ?? "",
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.requestedAt ? formatDateTime(r.requestedAt) : "—"}
        </Text>
      ),
    },
    {
      key: "notes",
      header: "備考",
      hideable: true,
      render: (r) => (
        <Text c="dimmed" size="xs" truncate>
          {r.notes ?? "—"}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      breadcrumbs={["生産", "承認管理"]}
      filters={
        <>
          <Select
            clearable
            data={TARGET_TYPE_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setTargetType}
            placeholder="種別"
            value={targetType}
            w={isMobile ? undefined : 150}
          />
          <Select
            clearable
            data={STEP_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setStep}
            placeholder="段階"
            value={step}
            w={isMobile ? undefined : 130}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="対象番号・依頼者・備考で検索"
          value={search}
        />
      }
      title="承認管理"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "requestedAt", dir: "asc" }}
        emptyIcon={<IconShieldCheck size={24} />}
        emptyMessage="承認待ちの依頼はありません"
        getRowId={(r) => r.id}
        onRowClick={(r) => {
          const href = targetHref(r);
          if (href) router.push(href);
        }}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Group gap="xs" wrap="nowrap">
                <Text c="dimmed" ff="mono" size="xs">
                  {targetLabel(r)}
                </Text>
                {r.isLegacy && (
                  <Badge color="gray" size="xs" variant="outline">
                    旧データ
                  </Badge>
                )}
              </Group>
              <Group gap="xs" mt={2}>
                <TargetTypeBadge targetType={r.targetType} />
                <StepBadge step={r.step} />
              </Group>
              <Text c="dimmed" size="xs" truncate>
                依頼者 {r.requestedBy}
              </Text>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <Text c="dimmed" size="xs">
                {r.requestedAt ? formatDateTime(r.requestedAt) : "—"}
              </Text>
            </Stack>
          </Group>
        )}
      />
    </ListShell>
  );
}
