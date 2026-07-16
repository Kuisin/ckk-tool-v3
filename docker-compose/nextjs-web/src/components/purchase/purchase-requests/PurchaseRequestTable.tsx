"use client";

/**
 * PurchaseRequestTable — 購買依頼 一覧 (PU04, design.md §8.1 / §14)。
 *
 * Columns: 依頼番号 / 依頼者 / 主要素材 / 明細数 / 状態 / 希望納期 / 更新日。
 * フィルタ: 検索（依頼番号・依頼者・素材）+ 状態。行クリック → 詳細。
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconClipboardList, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate, formatDateTime } from "@/lib/format";
import type { PurchaseRequestRow } from "./model";

const BASE_PATH = "/purchase/purchase-requests";

/** 主要素材（先頭明細）+ 他 N 件の表示文字列。 */
function materialSummary(r: PurchaseRequestRow): string {
  if (!r.primaryMaterial) return "—";
  return r.itemCount > 1
    ? `${r.primaryMaterial} 他${r.itemCount - 1}件`
    : r.primaryMaterial;
}

export function PurchaseRequestTable({ rows }: { rows: PurchaseRequestRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [status, setStatus] = useUrlSelectState("status");

  const reset = () => {
    setSearch(null);
    setStatus(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.requestNumber.includes(search) ||
      r.requesterName.includes(search) ||
      (r.primaryMaterial ?? "").includes(search);
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<PurchaseRequestRow>[] = [
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
      key: "requesterName",
      header: "依頼者",
      sortable: true,
      render: (r) => r.requesterName,
    },
    {
      key: "primaryMaterial",
      header: "主要素材",
      sortValue: (r) => r.primaryMaterial ?? "",
      render: (r) => (
        <Text ff="mono" size="sm">
          {materialSummary(r)}
        </Text>
      ),
    },
    {
      key: "itemCount",
      header: "明細数",
      align: "right",
      width: 90,
      sortValue: (r) => r.itemCount,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.itemCount}
        </Text>
      ),
    },
    {
      key: "status",
      header: "状態",
      width: 110,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge entity="PurchaseRequest" status={r.status} />,
    },
    {
      key: "desiredAt",
      header: "希望納期",
      width: 120,
      sortValue: (r) => r.desiredAt ?? "",
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(r.desiredAt)}
        </Text>
      ),
    },
    {
      key: "updatedAt",
      header: "更新日",
      width: 150,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDateTime(r.updatedAt)}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["購買", "購買依頼"]}
      filters={
        <Select
          clearable
          data={statusOptions("PurchaseRequest")}
          flex={isMobile ? 1 : undefined}
          onChange={setStatus}
          placeholder="状態"
          value={status}
          w={isMobile ? undefined : 150}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="依頼番号・依頼者・素材で検索"
          value={search}
        />
      }
      title="購買依頼"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "requestNumber", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconClipboardList size={24} />}
        emptyMessage="購買依頼がありません"
        getRowId={(r) => r.requestNumber}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.requestNumber}`)}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {r.requestNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {materialSummary(r)}
              </Text>
              <Group gap="md" mt={2}>
                <Text c="dimmed" size="xs">
                  {r.requesterName}
                </Text>
                <Text c="dimmed" size="xs">
                  明細 {r.itemCount} 件
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="PurchaseRequest" status={r.status} />
              <Text c="dimmed" size="xs">
                {formatDate(r.desiredAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
