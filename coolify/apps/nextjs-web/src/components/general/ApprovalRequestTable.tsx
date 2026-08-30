"use client";

/**
 * ApprovalRequestTable — 承認管理 一覧 (PD03, design.md §8.1/§14)。
 *
 * PENDING の承認依頼を対象種別横断で表示: 種別 / 対象番号（mono、対象詳細へ
 * リンク）/ 段階（「2/3 部門承認」— 段数は承認設定 MS0B が書類種別ごとに
 * 決める）/ 依頼者 / 依頼日時 / 備考。
 * 行クリックで対象書類の詳細（＝承認操作ができる画面）へ遷移する。
 *
 * 書類を開く権限が無い行には「閲覧権限なし」バッジを出す（遷移自体は止めない）
 * — 承認グループの所属と書類の閲覧権限は別の軸で、承認者でも開けない場合が
 * あるため。判定は data.ts の canReadTarget。
 */

import {
  Badge,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconLock, IconSearch, IconShieldCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import type { ApprovalRequestRow } from "@/app/(dashboard)/general/tasks/approvals-data";
import { useFormat } from "@/components/layout/PreferencesProvider";
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

const TARGET_TYPE_OPTIONS = APPROVAL_TARGET_TYPES.map((value) => ({
  value,
  label: APPROVAL_TARGET[value].label,
}));

/** 対象種別ごとの詳細画面パス（未知の種別のみ null）。 */
function targetHref(row: ApprovalRequestRow): string | null {
  return approvalTargetHref(row.targetType, encodeURIComponent(row.targetId));
}

function targetLabel(row: ApprovalRequestRow): string {
  // 指示書はサーバー側で書類番号 WO-YYYYMM-NNNNN へ解決済み。
  return row.targetDisplay;
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
 * 閲覧権限バッジ — 承認グループの所属と書類の閲覧権限は別の軸なので、
 * 承認者でもその書類を開けないことがある（例: purchasing ロールは
 * approve:READ を持つが order_acceptance:READ は持たない）。
 * 遷移は止めず、押す前に分かるようにするだけ。
 */
function NoAccessBadge() {
  return (
    <Tooltip
      label="この書類を開く権限がありません。承認は書類の詳細画面で行うため、管理者に権限の付与を依頼してください。"
      multiline
      w={260}
      withinPortal
    >
      <Badge
        color="gray"
        leftSection={<IconLock size={11} />}
        size="xs"
        variant="outline"
      >
        閲覧権限なし
      </Badge>
    </Tooltip>
  );
}

/**
 * 段バッジ — 「2/3 部門承認」。最終段だけ色を変えて「あと 1 つで通る」を出す
 * （design.md §9 の承認依頼中配色: 途中=yellow / 最終=orange）。
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

export function ApprovalRequestTable({
  rows,
  embedded = false,
}: {
  rows: ApprovalRequestRow[];
  /** 承認・予定 (CM01) のセクションとして埋め込む（見出しは親が出す）。 */
  embedded?: boolean;
}) {
  const fmt = useFormat();
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
      r.targetDisplay.includes(search) ||
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
        <Group gap={6} wrap="nowrap">
          <Text className="tabular-nums" ff="mono" size="sm">
            {targetLabel(r)}
          </Text>
          {!r.canReadTarget && <NoAccessBadge />}
        </Group>
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
          {r.requestedAt ? fmt.dateTime(r.requestedAt) : "—"}
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
      breadcrumbs={["一般", "承認・予定"]}
      embedded={embedded}
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
      title="承認・予定"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "requestedAt", dir: "asc" }}
        emptyIcon={<IconShieldCheck size={24} />}
        emptyMessage="承認依頼中の依頼はありません"
        getRowId={(r) => r.id}
        onRowClick={(r) => {
          const href = targetHref(r);
          if (href) router.push(href);
        }}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Group gap={6} wrap="nowrap">
                <Text c="dimmed" ff="mono" size="xs">
                  {targetLabel(r)}
                </Text>
                {!r.canReadTarget && <NoAccessBadge />}
              </Group>
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
                {r.requestedAt ? fmt.dateTime(r.requestedAt) : "—"}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
