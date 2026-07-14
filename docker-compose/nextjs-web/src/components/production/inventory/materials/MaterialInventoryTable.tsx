"use client";

/**
 * MaterialInventoryTable — 素材在庫 一覧 (PD05, design.md §8.1 / §14)。
 *
 * 列: 素材（コード mono + 名称）/ 工場 / 在庫数（+単位）/ 予約数 /
 * 利用可能 (InventoryBadge) / 次回入荷（ATP nextReceiptDate）/ 更新日。
 * フィルタ: 素材検索（コード・名称）・工場。行クリック → 詳細。
 */

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch, IconStack2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { InventoryBadge } from "@/components/production/InventoryBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate } from "@/lib/format";
import type { MaterialInventoryRow } from "./model";

const BASE_PATH = "/production/inventory/materials";

export function MaterialInventoryTable({
  rows,
}: {
  rows: MaterialInventoryRow[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [factory, setFactory] = useState<string | null>(null);

  const reset = () => {
    setSearch("");
    setFactory(null);
  };

  // 工場フィルタの選択肢は行から導出（在庫のある工場のみ）
  const factoryOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) if (r.factoryName) names.add(r.factoryName);
    return [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }, [rows]);

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.materialCode.includes(search) ||
      r.materialName.includes(search);
    const matchesFactory = !factory || r.factoryName === factory;
    return matchesSearch && matchesFactory;
  });

  const columns: Column<MaterialInventoryRow>[] = [
    {
      key: "material",
      header: "素材",
      sortable: true,
      sortValue: (r) => r.materialCode,
      render: (r) => (
        <>
          <Text ff="mono" size="sm">
            {r.materialCode}
          </Text>
          <Text c="dimmed" size="xs">
            {r.materialName}
          </Text>
        </>
      ),
    },
    {
      key: "factoryName",
      header: "工場",
      sortable: true,
      width: 140,
      sortValue: (r) => r.factoryName ?? "",
      render: (r) => r.factoryName ?? "—",
    },
    {
      key: "quantity",
      header: "在庫数",
      align: "right",
      width: 110,
      sortable: true,
      sortValue: (r) => r.quantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.quantity.toLocaleString("ja-JP")} {r.unit}
        </Text>
      ),
    },
    {
      key: "reservedQuantity",
      header: "予約数",
      align: "right",
      width: 100,
      sortable: true,
      sortValue: (r) => r.reservedQuantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.reservedQuantity.toLocaleString("ja-JP")}
        </Text>
      ),
    },
    {
      key: "available",
      header: "利用可能",
      width: 160,
      sortable: true,
      sortValue: (r) => r.available,
      render: (r) => (
        <InventoryBadge
          available={r.available}
          reserved={r.reservedQuantity}
          unit={r.unit}
        />
      ),
    },
    {
      key: "nextReceiptDate",
      header: "次回入荷",
      width: 110,
      sortable: true,
      sortValue: (r) => r.nextReceiptDate ?? "",
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.nextReceiptDate ? formatDate(r.nextReceiptDate) : "—"}
        </Text>
      ),
    },
    {
      key: "updatedAt",
      header: "更新日",
      width: 110,
      sortable: true,
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
      breadcrumbs={["生産", "素材在庫"]}
      filters={
        <Select
          clearable
          data={factoryOptions}
          flex={isMobile ? 1 : undefined}
          onChange={setFactory}
          placeholder="工場"
          value={factory}
          w={isMobile ? undefined : 160}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="素材コード・名称で検索"
          value={search}
        />
      }
      title="素材在庫"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyIcon={<IconStack2 size={24} />}
        emptyMessage="素材在庫がありません"
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text ff="mono" fw={600} size="sm" truncate>
                {r.materialCode}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {r.materialName}
              </Text>
              <Group gap="md" mt={2}>
                <Text c="dimmed" size="xs">
                  {r.factoryName ?? "工場未設定"}
                </Text>
                <Text size="xs">
                  在庫 {r.quantity.toLocaleString("ja-JP")} {r.unit} / 利用可能{" "}
                  {r.available.toLocaleString("ja-JP")}
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              <Text c="dimmed" size="xs">
                次回入荷{" "}
                {r.nextReceiptDate ? formatDate(r.nextReceiptDate) : "—"}
              </Text>
              <Text c="dimmed" size="xs">
                {formatDate(r.updatedAt)}
              </Text>
            </Stack>
          </Group>
        )}
      />
    </ListShell>
  );
}
