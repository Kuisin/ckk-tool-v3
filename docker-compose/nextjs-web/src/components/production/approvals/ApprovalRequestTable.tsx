"use client";

/**
 * ApprovalRequestTable — 承認管理 一覧 (PD03, design.md §8.1/§14)。
 *
 * PENDING の承認依頼を対象種別横断で表示: 種別 / 対象番号（mono、対象詳細へ
 * リンク）/ 段階（「2/3 部門承認」— 段数は承認設定 MS0B が書類種別ごとに
 * 決める）/ 依頼者 / 依頼日時 / 備考。
 * 行クリックで対象書類の詳細（＝承認操作ができる画面）へ遷移する。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch, IconShieldCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import type { ApprovalRequestRow } from "@/app/(dashboard)/production/approvals/data";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  APPROVAL_TARGET,
  APPROVAL_TARGET_TYPES,
  approvalTargetHref,
  isApprovalTargetType,
} from "@/lib/approval-targets";
import { formatDateTime } from "@/lib/format";

const TARGET_TYPE_OPTIONS = APPROVAL_TARGET_TYPES.map((value) => ({
  value,
  label: APPROVAL_TARGET[value].label,
}));

/** 対象種別ごとの詳細画面パス（未知の種別のみ null）。 */
function targetHref(row: ApprovalRequestRow): string | null {
  return approvalTargetHref(row.targetType, encodeURIComponent(row.targetId));
}

function targetLabel(row: ApprovalRequestRow): string {
  return row.targetType === "work_orders" ? `#${row.targetId}` : row.targetId;
}

function TargetTypeBadge({ targetType }: { targetType: string }) {
  const meta = isApprovalTargetType(targetType)
    ? APPROVAL_TARGET[targetType]
    : null;
  return (
    <Badge color={meta?.color ?? "gray"} size="sm" variant="light">
      {meta?.label ?? targetType}
    </Badge>
  );
}

/**
 * 段バッジ — 「2/3 部門承認」。最終段だけ色を変えて「あと 1 つで通る」を出す
 * （design.md §9 の承認待ち配色: 途中=yellow / 最終=orange）。
 * ALL 段は承認済み人数を添える。
 */
function StepBadge({ row }: { row: ApprovalRequestRow }) {
  const last = row.stepNo >= row.stepCount;
  return (
    <Group gap={4} wrap="nowrap">
      <Badge color={last ? "orange" : "yellow"} size="sm" variant="light">
        {row.stepCount > 1
          ? `${row.stepNo}/${row.stepCount} ${row.stepLabel}`
          : row.stepLabel}
      </Badge>
      {row.mode === "ALL" && (
        <Badge color="gray" size="xs" variant="outline">
          全員 {row.approvedCount}/{row.requiredCount}
        </Badge>
      )}
    </Group>
  );
}

export function ApprovalRequestTable({ rows }: { rows: ApprovalRequestRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [targetType, setTargetType] = useUrlSelectState("targetType");

  const reset = () => {
    setSearch(null);
    setTargetType(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.targetId.includes(search) ||
      r.requestedBy.includes(search) ||
      (r.notes ?? "").includes(search);
    const matchesType = !targetType || r.targetType === targetType;
    return matchesSearch && matchesType;
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
        <Text className="tabular-nums" ff="mono" size="sm">
          {targetLabel(r)}
        </Text>
      ),
    },
    {
      key: "step",
      header: "段階",
      width: 170,
      sortable: true,
      sortValue: (r) => r.stepNo,
      render: (r) => <StepBadge row={r} />,
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
      filters=<Select
        clearable
        data={TARGET_TYPE_OPTIONS}
        flex={isMobile ? 1 : undefined}
        onChange={setTargetType}
        placeholder="種別"
        value={targetType}
        w={isMobile ? undefined : 150}
      />
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
              <Text c="dimmed" ff="mono" size="xs">
                {targetLabel(r)}
              </Text>
              <Group gap="xs" mt={2}>
                <TargetTypeBadge targetType={r.targetType} />
                <StepBadge row={r} />
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
        urlState
      />
    </ListShell>
  );
}
