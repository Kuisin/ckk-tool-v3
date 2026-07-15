"use client";

/**
 * DesignRequestTable — 設計依頼書 一覧 (SA04, design.md §8.1 / §14).
 *
 * Columns: 依頼番号 / トリガー / 製品 / 状態 / 更新日。
 * フィルタ: 検索（番号・製品・依頼内容）+ トリガー + 状態。行クリック → 詳細。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconRuler2, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  DESIGN_TRIGGER_LABEL,
  DESIGN_TRIGGER_OPTIONS,
} from "@/lib/enum-labels";
import { formatDate } from "@/lib/format";
import { DESIGN_TRIGGER_COLOR, type DesignRequest } from "./model";

const BASE_PATH = "/sales/design-requests";

function TriggerBadge({ trigger }: { trigger: DesignRequest["trigger"] }) {
  return (
    <Badge color={DESIGN_TRIGGER_COLOR[trigger] ?? "gray"} variant="light">
      {DESIGN_TRIGGER_LABEL[trigger] ?? trigger}
    </Badge>
  );
}

export function DesignRequestTable({ rows }: { rows: DesignRequest[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [trigger, setTrigger] = useUrlSelectState("trigger");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setTrigger(null);
    setStatus(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.requestNumber.includes(search) ||
      (r.productName ?? "").includes(search) ||
      (r.description ?? "").includes(search);
    const matchesTrigger = !trigger || r.trigger === trigger;
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesTrigger && matchesStatus;
  });

  const columns: Column<DesignRequest>[] = [
    {
      key: "requestNumber",
      header: "依頼番号",
      sortable: true,
      render: (r) => (
        <Text ff="mono" size="sm">
          {r.requestNumber}
        </Text>
      ),
    },
    {
      key: "trigger",
      header: "トリガー",
      width: 110,
      sortValue: (r) => r.trigger,
      render: (r) => <TriggerBadge trigger={r.trigger} />,
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
      key: "status",
      header: "状態",
      width: 100,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge entity="DesignRequest" status={r.status} />,
    },
    {
      key: "updatedAt",
      header: "更新日",
      width: 120,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(r.updatedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["販売", "設計依頼書"]}
      filters={
        <>
          <Select
            clearable
            data={DESIGN_TRIGGER_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setTrigger}
            placeholder="トリガー"
            value={trigger}
            w={isMobile ? undefined : 140}
          />
          <Select
            clearable
            data={statusOptions("DesignRequest")}
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
          placeholder="依頼番号・製品・依頼内容で検索"
          value={search}
        />
      }
      title="設計依頼書"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "requestNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconRuler2 size={24} />}
        emptyMessage="設計依頼書がありません"
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {r.requestNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {r.productName ?? "製品未指定"}
              </Text>
              {r.description && (
                <Text c="dimmed" size="xs" truncate>
                  {r.description}
                </Text>
              )}
              <Group gap="xs" mt={2}>
                <TriggerBadge trigger={r.trigger} />
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="DesignRequest" status={r.status} />
              <Text c="dimmed" size="xs">
                {formatDate(r.updatedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
