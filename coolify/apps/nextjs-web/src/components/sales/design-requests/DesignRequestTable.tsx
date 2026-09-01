"use client";

/**
 * DesignRequestTable — 設計依頼書 一覧 (SA06, design.md §8.1 / §14).
 *
 * Columns: 依頼番号 / 区分 / 製品 / 担当者 / 希望納期 / 状態 / 更新日。
 * フィルタ: 検索（番号・製品・依頼内容・担当者）+ 区分 + 担当者 + 状態。
 * 希望納期は**未完了で期限を過ぎたものだけ**赤にする（完了済みまで赤くすると
 * 一覧が赤だらけになって、いま手を打つべきものが埋もれる）。
 * 行クリック → 詳細。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconRuler2, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  designKindLabel,
  designKindOptions,
  designTriggerLabel,
  designTriggerOptions,
} from "@/lib/enum-labels";
import { statusOptions } from "@/lib/status-map";
import {
  DESIGN_KIND_COLOR,
  DESIGN_TRIGGER_COLOR,
  type DesignRequest,
} from "./model";

const BASE_PATH = "/sales/design-requests";

/**
 * 希望納期を過ぎているか — **未完了のものだけ**。完了・キャンセル済みまで
 * 赤くすると一覧が赤で埋まり、いま手を打つべき行が読めなくなる。
 */
function isOverdue(r: DesignRequest): boolean {
  if (!r.desiredAt) return false;
  if (r.status === "COMPLETED" || r.status === "CANCELLED") return false;
  return r.desiredAt < new Date().toISOString().slice(0, 10);
}

function TriggerBadge({ trigger }: { trigger: DesignRequest["trigger"] }) {
  const locale = useLocale();
  return (
    <Badge color={DESIGN_TRIGGER_COLOR[trigger] ?? "gray"} variant="light">
      {designTriggerLabel(trigger, locale) ?? trigger}
    </Badge>
  );
}

export function DesignRequestTable({ rows }: { rows: DesignRequest[] }) {
  const tr = useTr();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [trigger, setTrigger] = useUrlSelectState("trigger");
  const [kind, setKind] = useUrlSelectState("kind");
  const [assignee, setAssignee] = useUrlSelectState("assignee");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setTrigger(null);
    setKind(null);
    setAssignee(null);
    setStatus(null);
  };

  // 担当者フィルタの選択肢は表示中の行から作る（担当者マスタを別途引かない）。
  const assigneeOptions = [
    ...new Map(
      rows
        .filter((r) => r.assigneeId && r.assigneeName)
        .map((r) => [r.assigneeId as string, r.assigneeName as string]),
    ),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.requestNumber.includes(search) ||
      (r.productName ?? "").includes(search) ||
      (r.description ?? "").includes(search) ||
      (r.assigneeName ?? "").includes(search);
    const matchesTrigger = !trigger || r.trigger === trigger;
    const matchesKind = !kind || r.kind === kind;
    const matchesAssignee = !assignee || r.assigneeId === assignee;
    const matchesStatus = !status || r.status === status;
    return (
      matchesSearch &&
      matchesTrigger &&
      matchesKind &&
      matchesAssignee &&
      matchesStatus
    );
  });

  const columns: Column<DesignRequest>[] = [
    {
      key: "requestNumber",
      header: tr("依頼番号"),
      sortable: true,
      render: (r) => (
        <Text ff="mono" size="sm">
          {r.requestNumber}
        </Text>
      ),
    },
    {
      key: "kind",
      header: tr("区分"),
      width: 90,
      sortValue: (r) => r.kind,
      render: (r) => (
        <Badge color={DESIGN_KIND_COLOR[r.kind] ?? "gray"} variant="light">
          {designKindLabel(r.kind, locale) ?? r.kind}
        </Badge>
      ),
    },
    {
      key: "productName",
      header: "製品",
      sortable: true,
      sortValue: (r) => r.productName ?? "",
      render: (r) =>
        r.productName ? (
          <Text size="sm">{r.productName}</Text>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
    },
    {
      key: "assigneeName",
      header: tr("担当者"),
      width: 130,
      sortable: true,
      sortValue: (r) => r.assigneeName ?? "",
      render: (r) =>
        r.assigneeName ? (
          <Text size="sm">{r.assigneeName}</Text>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
    },
    {
      key: "desiredAt",
      header: tr("希望納期"),
      width: 110,
      sortable: true,
      sortValue: (r) => r.desiredAt ?? "",
      render: (r) =>
        r.desiredAt ? (
          <Text
            c={isOverdue(r) ? "red" : undefined}
            className="tabular-nums"
            fw={isOverdue(r) ? 600 : undefined}
            size="sm"
          >
            {fmt.date(r.desiredAt)}
          </Text>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
    },
    {
      key: "status",
      header: tr("状態"),
      width: 110,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge entity="DesignRequest" status={r.status} />,
    },
    {
      key: "updatedAt",
      header: tr("更新日"),
      width: 120,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(r.updatedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("販売"), tr("設計依頼書")]}
      filters={
        <>
          <Select
            clearable
            data={designKindOptions(locale)}
            flex={isMobile ? 1 : undefined}
            onChange={setKind}
            placeholder={tr("区分")}
            value={kind}
            w={isMobile ? undefined : 120}
          />
          <Select
            clearable
            data={designTriggerOptions(locale)}
            flex={isMobile ? 1 : undefined}
            onChange={setTrigger}
            placeholder={tr("トリガー")}
            value={trigger}
            w={isMobile ? undefined : 130}
          />
          <Select
            clearable
            data={assigneeOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setAssignee}
            placeholder={tr("担当者")}
            searchable
            value={assignee}
            w={isMobile ? undefined : 140}
          />
          <Select
            clearable
            data={statusOptions("DesignRequest")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder={tr("状態")}
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
          placeholder={tr("依頼番号・製品・依頼内容・担当者で検索")}
          value={search}
        />
      }
      title={tr("設計依頼書")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "requestNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconRuler2 size={24} />}
        emptyMessage={tr("設計依頼書がありません")}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {r.requestNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {r.productName ?? tr("製品未指定")}
              </Text>
              {r.description && (
                <Text c="dimmed" size="xs" truncate>
                  {r.description}
                </Text>
              )}
              <Group gap="xs" mt={2}>
                <Badge
                  color={DESIGN_KIND_COLOR[r.kind] ?? "gray"}
                  variant="light"
                >
                  {designKindLabel(r.kind, locale) ?? r.kind}
                </Badge>
                <TriggerBadge trigger={r.trigger} />
                {r.assigneeName && (
                  <Text c="dimmed" size="xs">
                    {r.assigneeName}
                  </Text>
                )}
                {r.desiredAt && (
                  <Text c={isOverdue(r) ? "red" : "dimmed"} size="xs">
                    納期 {fmt.date(r.desiredAt)}
                  </Text>
                )}
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="DesignRequest" status={r.status} />
              <Text c="dimmed" size="xs">
                {fmt.date(r.updatedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
