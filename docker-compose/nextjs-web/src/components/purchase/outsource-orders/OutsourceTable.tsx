"use client";

/**
 * OutsourceTable — 外注依頼 一覧 (PU02, design.md §8.1 / §14)。
 *
 * 指示書の外注工程（execution_location = OUTSOURCE）の読み取り専用一覧。
 * Columns: 指示書番号（指示書詳細へのリンク）/ 製品 / 工程名 / 外注先 /
 * 依頼日 / 入荷予定日 / 入荷日 / 状態。
 * フィルタ: 検索 + 外注先 + 状態。行クリック → 工程実行画面
 * （依頼日・入荷予定日・入荷日はそこで編集する）。
 */

import { Anchor, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch, IconTruckDelivery } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate } from "@/lib/format";
import type { OutsourceStepRow } from "./model";

const WORK_ORDERS_PATH = "/production/work-orders";

export function OutsourceTable({ rows }: { rows: OutsourceStepRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const reset = () => {
    setSearch("");
    setSupplier(null);
    setStatus(null);
  };

  // 外注先フィルタ options — 一覧に登場する外注先から導出する。
  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.supplierBpId && r.supplierName) {
        map.set(r.supplierBpId, r.supplierName);
      }
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      String(r.workOrderNumber).includes(search) ||
      r.productName.includes(search) ||
      r.processName.includes(search) ||
      (r.supplierName ?? "").includes(search);
    const matchesSupplier = !supplier || r.supplierBpId === supplier;
    const matchesStatus = !status || r.status === status;
    return matchesSearch && matchesSupplier && matchesStatus;
  });

  const columns: Column<OutsourceStepRow>[] = [
    {
      key: "workOrderNumber",
      header: "指示書番号",
      width: 110,
      sortable: true,
      sortValue: (r) => r.workOrderNumber,
      render: (r) => (
        <Anchor
          component={Link}
          href={`${WORK_ORDERS_PATH}/${r.workOrderNumber}`}
          onClick={(e) => e.stopPropagation()}
          size="sm"
        >
          <Text c="blue" className="tabular-nums" ff="mono" size="sm" span>
            {r.workOrderNumber}
          </Text>
        </Anchor>
      ),
    },
    {
      key: "productName",
      header: "製品",
      sortable: true,
      render: (r) => r.productName,
    },
    {
      key: "processName",
      header: "工程名",
      sortable: true,
      render: (r) => r.processName,
    },
    {
      key: "supplierName",
      header: "外注先",
      sortable: true,
      sortValue: (r) => r.supplierName ?? "",
      render: (r) => r.supplierName ?? "—",
    },
    {
      key: "requestedAt",
      header: "依頼日",
      width: 110,
      sortable: true,
      sortValue: (r) => r.requestedAt ?? "",
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(r.requestedAt)}
        </Text>
      ),
    },
    {
      key: "expectedAt",
      header: "入荷予定日",
      width: 110,
      sortable: true,
      sortValue: (r) => r.expectedAt ?? "",
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(r.expectedAt)}
        </Text>
      ),
    },
    {
      key: "receivedAt",
      header: "入荷日",
      width: 110,
      sortable: true,
      sortValue: (r) => r.receivedAt ?? "",
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(r.receivedAt)}
        </Text>
      ),
    },
    {
      key: "status",
      header: "状態",
      width: 100,
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge entity="Step" status={r.status} />,
    },
  ];

  return (
    <ListShell
      breadcrumbs={["購買", "外注依頼"]}
      filters={
        <>
          <Select
            clearable
            data={supplierOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setSupplier}
            placeholder="外注先"
            searchable
            value={supplier}
            w={isMobile ? undefined : 180}
          />
          <Select
            clearable
            data={statusOptions("Step")}
            flex={isMobile ? 1 : undefined}
            onChange={setStatus}
            placeholder="状態"
            value={status}
            w={isMobile ? undefined : 130}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="指示書番号・製品・工程・外注先で検索"
          value={search}
        />
      }
      title="外注依頼"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "workOrderNumber", dir: "desc" }}
        emptyIcon={<IconTruckDelivery size={24} />}
        emptyMessage="外注工程がありません（指示書の工程で外注を選ぶと表示されます）"
        getRowId={(r) => r.stepId}
        onRowClick={(r) =>
          router.push(
            `${WORK_ORDERS_PATH}/${r.workOrderNumber}/steps/${r.stepId}`,
          )
        }
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                #{r.workOrderNumber}
              </Text>
              <Text fw={600} size="sm" truncate>
                {r.processName}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {r.productName}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {r.supplierName ?? "外注先未設定"}
              </Text>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <StatusBadge entity="Step" status={r.status} />
              <Text c="dimmed" size="xs">
                予定 {formatDate(r.expectedAt)}
              </Text>
            </Stack>
          </Group>
        )}
      />
    </ListShell>
  );
}
