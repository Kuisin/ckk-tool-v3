"use client";

/**
 * ProductInventoryTable — 製品在庫 一覧 (PD04, design.md §8.1 / §14)。
 *
 * SegmentedControl で「製品在庫 / 仕掛品」を切替:
 * - 製品在庫: product_inventory 行。列 = 製品 / 工場 / ロット / 在庫数 /
 *   予約数 / 利用可能 (InventoryBadge) / 区分（半製品 orange）/ 更新日。
 *   フィルタ = 製品検索・工場・区分（完成品/半製品）。
 * - 仕掛品: 進行中指示書の工程別仕掛数（サーバー算出）。製品ごとに
 *   グループ表示し、指示書番号クリックで指示書詳細へ。
 */

import {
  Anchor,
  Badge,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconBoxSeam, IconProgress, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { InventoryBadge } from "@/components/production/InventoryBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate } from "@/lib/format";
import type { ProductInventoryRow, WipRow } from "./model";

const BASE_PATH = "/production/inventory/products";

const KIND_OPTIONS = [
  { value: "FINISHED", label: "完成品" },
  { value: "SEMI_FINISHED", label: "半製品" },
];

export function ProductInventoryTable({
  rows,
  wipRows,
}: {
  rows: ProductInventoryRow[];
  wipRows: WipRow[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // 表示モード・検索・フィルタは URL search params に保持（design.md §8.1 /
  // ページ共有）。既定の「製品在庫」ビューはパラメータ省略で URL を短く保つ。
  const [view, setView] = useUrlStringState("view", "stock");
  const [search, setSearch] = useUrlStringState("q");
  const [factory, setFactory] = useUrlSelectState("factory");
  const [kind, setKind] = useUrlSelectState("kind");

  const reset = () => {
    setSearch(null);
    setFactory(null);
    setKind(null);
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
      r.productName.includes(search) ||
      (r.productCode ?? "").includes(search);
    const matchesFactory = !factory || r.factoryName === factory;
    const matchesKind =
      !kind ||
      (kind === "SEMI_FINISHED" ? r.isSemiFinished : !r.isSemiFinished);
    return matchesSearch && matchesFactory && matchesKind;
  });

  const filteredWip = wipRows.filter(
    (r) =>
      !search ||
      r.productName.includes(search) ||
      (r.productCode ?? "").includes(search) ||
      String(r.workOrderNumber).includes(search),
  );

  const columns: Column<ProductInventoryRow>[] = [
    {
      key: "productName",
      header: "製品",
      sortable: true,
      render: (r) => (
        <>
          <Text size="sm">{r.productName}</Text>
          {r.productCode && (
            <Text c="dimmed" ff="mono" size="xs">
              {r.productCode}
            </Text>
          )}
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
      key: "lotNumber",
      header: "ロット",
      align: "right",
      width: 90,
      sortable: true,
      sortValue: (r) => r.lotNumber ?? 0,
      render: (r) =>
        r.lotNumber != null ? (
          <Text className="tabular-nums" ff="mono" size="sm">
            {r.lotNumber}
          </Text>
        ) : (
          "—"
        ),
    },
    {
      key: "quantity",
      header: "在庫数",
      align: "right",
      width: 90,
      sortable: true,
      sortValue: (r) => r.quantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.quantity.toLocaleString("ja-JP")}
        </Text>
      ),
    },
    {
      key: "reservedQuantity",
      header: "予約数",
      align: "right",
      width: 90,
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
      width: 150,
      sortable: true,
      sortValue: (r) => r.available,
      render: (r) => (
        <InventoryBadge
          available={r.available}
          reserved={r.reservedQuantity}
          unit="本"
        />
      ),
    },
    {
      key: "kind",
      header: "区分",
      width: 90,
      sortValue: (r) => (r.isSemiFinished ? 1 : 0),
      render: (r) =>
        r.isSemiFinished ? (
          <Badge color="orange" variant="light">
            半製品
          </Badge>
        ) : (
          <Badge color="gray" variant="light">
            完成品
          </Badge>
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
      breadcrumbs={["生産", "製品在庫"]}
      filters={
        view === "stock" ? (
          <>
            <Select
              clearable
              data={factoryOptions}
              flex={isMobile ? 1 : undefined}
              onChange={setFactory}
              placeholder="工場"
              value={factory}
              w={isMobile ? undefined : 160}
            />
            <Select
              clearable
              data={KIND_OPTIONS}
              flex={isMobile ? 1 : undefined}
              onChange={setKind}
              placeholder="区分"
              value={kind}
              w={isMobile ? undefined : 130}
            />
          </>
        ) : undefined
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={
            view === "stock"
              ? "製品名・製品コードで検索"
              : "製品名・指示書番号で検索"
          }
          value={search}
        />
      }
      title="製品在庫"
    >
      <Stack gap="sm">
        <SegmentedControl
          data={[
            { value: "stock", label: "製品在庫" },
            { value: "wip", label: "仕掛品" },
          ]}
          onChange={setView}
          value={view}
          w={isMobile ? "100%" : 240}
        />
        {view === "stock" ? (
          <DataTable
            columns={columns}
            data={filtered}
            defaultSort={{ key: "updatedAt", dir: "desc" }}
            emptyIcon={<IconBoxSeam size={24} />}
            emptyMessage="製品在庫がありません"
            getRowId={(r) => r.id}
            onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
            renderCard={(r) => (
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack className="min-w-0" gap={3}>
                  <Text fw={600} size="sm" truncate>
                    {r.productName}
                  </Text>
                  {r.productCode && (
                    <Text c="dimmed" ff="mono" size="xs">
                      {r.productCode}
                    </Text>
                  )}
                  <Group gap="md" mt={2}>
                    <Text c="dimmed" size="xs">
                      {r.factoryName ?? "工場未設定"}
                    </Text>
                    {r.lotNumber != null && (
                      <Text c="dimmed" ff="mono" size="xs">
                        ロット {r.lotNumber}
                      </Text>
                    )}
                  </Group>
                  <Text size="xs">
                    在庫 {r.quantity.toLocaleString("ja-JP")} / 利用可能{" "}
                    {r.available.toLocaleString("ja-JP")}
                  </Text>
                </Stack>
                <Stack align="flex-end" className="shrink-0" gap={4}>
                  {r.isSemiFinished && (
                    <Badge color="orange" variant="light">
                      半製品
                    </Badge>
                  )}
                  <Text c="dimmed" size="xs">
                    {formatDate(r.updatedAt)}
                  </Text>
                </Stack>
              </Group>
            )}
            urlState
          />
        ) : (
          <WipList rows={filteredWip} />
        )}
      </Stack>
    </ListShell>
  );
}

/** 仕掛品リスト — 製品ごとにグループ化した工程別仕掛数テーブル。 */
function WipList({ rows }: { rows: WipRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconProgress size={24} />}
        message="進行中の仕掛品はありません"
      />
    );
  }

  // 製品名（+ コード）でグループ化（rows は製品順にサーバーでソート済み）
  const groups: { key: string; label: string; items: WipRow[] }[] = [];
  for (const r of rows) {
    const key = `${r.productName}|${r.productCode ?? ""}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(r);
    else
      groups.push({
        key,
        label: r.productCode
          ? `${r.productName}（${r.productCode}）`
          : r.productName,
        items: [r],
      });
  }

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={120}>指示書番号</Table.Th>
            <Table.Th>工程</Table.Th>
            <Table.Th ta="right" w={110}>
              仕掛数
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groups.map((g) => (
            <GroupRows group={g} key={g.key} />
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function GroupRows({
  group,
}: {
  group: { key: string; label: string; items: WipRow[] };
}) {
  const total = group.items.reduce((s, r) => s + r.wip, 0);
  return (
    <>
      <Table.Tr bg="var(--mantine-color-default-hover)">
        <Table.Td colSpan={2}>
          <Text fw={600} size="sm">
            {group.label}
          </Text>
        </Table.Td>
        <Table.Td className="tabular-nums" ta="right">
          <Text fw={600} size="sm">
            計 {total.toLocaleString("ja-JP")}
          </Text>
        </Table.Td>
      </Table.Tr>
      {group.items.map((r) => (
        <Table.Tr key={r.stepId}>
          <Table.Td>
            <Anchor
              component={Link}
              ff="mono"
              href={`/production/work-orders/${r.workOrderNumber}`}
              size="sm"
            >
              #{r.workOrderNumber}
            </Anchor>
          </Table.Td>
          <Table.Td>{r.stepName}</Table.Td>
          <Table.Td className="tabular-nums" ta="right">
            {r.wip.toLocaleString("ja-JP")}
          </Table.Td>
        </Table.Tr>
      ))}
    </>
  );
}
