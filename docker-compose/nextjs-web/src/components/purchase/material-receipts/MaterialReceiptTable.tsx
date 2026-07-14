"use client";

/**
 * MaterialReceiptTable — 素材入荷 一覧 (PU01, design.md §8.1 / §14)。
 *
 * Columns: 素材（コード+名称）/ 仕入先 / 入荷工場 / 数量 / 入荷日 /
 * 発注明細（PO番号リンク or 直接調達）。
 * フィルタ: 検索（素材・仕入先・PO番号）+ 入荷区分。行クリック → 詳細。
 */

import {
  Anchor,
  Badge,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPackageImport, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate } from "@/lib/format";
import type { MaterialReceiptView } from "./model";

const BASE_PATH = "/purchase/material-receipts";
const PO_PATH = "/purchase/purchase-orders";

const SOURCE_OPTIONS = [
  { value: "po", label: "発注入荷" },
  { value: "direct", label: "直接調達" },
];

export function MaterialReceiptTable({
  rows,
}: {
  rows: MaterialReceiptView[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string | null>(null);

  const reset = () => {
    setSearch("");
    setSource(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.materialCode.includes(search) ||
      r.materialName.includes(search) ||
      (r.supplierName ?? "").includes(search) ||
      (r.poNumber ?? "").includes(search);
    const matchesSource =
      !source || (source === "po" ? r.poNumber != null : r.poNumber == null);
    return matchesSearch && matchesSource;
  });

  const columns: Column<MaterialReceiptView>[] = [
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
      key: "supplierName",
      header: "仕入先",
      sortable: true,
      sortValue: (r) => r.supplierName ?? "",
      render: (r) => r.supplierName ?? "—",
    },
    {
      key: "factoryName",
      header: "入荷工場",
      sortValue: (r) => r.factoryName ?? "",
      render: (r) => r.factoryName ?? "—",
    },
    {
      key: "quantity",
      header: "数量",
      align: "right",
      width: 110,
      sortValue: (r) => r.quantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.quantity} {r.unit}
        </Text>
      ),
    },
    {
      key: "receivedAt",
      header: "入荷日",
      width: 120,
      sortable: true,
      sortValue: (r) => r.receivedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(r.receivedAt)}
        </Text>
      ),
    },
    {
      key: "poNumber",
      header: "発注明細",
      width: 170,
      sortValue: (r) => r.poNumber ?? "",
      render: (r) =>
        r.poNumber ? (
          <Anchor
            component={Link}
            href={`${PO_PATH}/${r.poNumber}`}
            onClick={(e) => e.stopPropagation()}
            size="sm"
          >
            <Text c="blue" className="tabular-nums" ff="mono" size="sm" span>
              {r.poNumber}
            </Text>
          </Anchor>
        ) : (
          <Badge color="gray" variant="light">
            直接調達
          </Badge>
        ),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["購買", "素材入荷"]}
      filters={
        <Select
          clearable
          data={SOURCE_OPTIONS}
          flex={isMobile ? 1 : undefined}
          onChange={setSource}
          placeholder="入荷区分"
          value={source}
          w={isMobile ? undefined : 150}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="素材コード・名称・仕入先・発注番号で検索"
          value={search}
        />
      }
      title="素材入荷"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "receivedAt", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconPackageImport size={24} />}
        emptyMessage="素材入荷がありません"
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {r.materialCode}
              </Text>
              <Text fw={600} size="sm" truncate>
                {r.materialName}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {r.supplierName ?? "仕入先なし"}
                {r.factoryName ? ` / ${r.factoryName}` : ""}
              </Text>
              <Group gap="md" mt={2}>
                <Text c="dimmed" size="xs">
                  {r.quantity} {r.unit}
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              {r.poNumber ? (
                <Text c="dimmed" ff="mono" size="xs">
                  {r.poNumber}
                </Text>
              ) : (
                <Badge color="gray" variant="light">
                  直接調達
                </Badge>
              )}
              <Text c="dimmed" size="xs">
                {formatDate(r.receivedAt)}
              </Text>
            </Stack>
          </Group>
        )}
      />
    </ListShell>
  );
}
