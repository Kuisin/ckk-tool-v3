"use client";

/**
 * UnifiedInventory — 在庫管理 (PD04) 統合ビュー。
 *
 * 製品在庫・素材在庫・仕掛品を 1 アプリに統合し、タブで切り替える
 * （旧 PD04 製品在庫 / PD05 素材在庫 は本アプリへ統合 — 旧 URL はリダイレクト）。
 * - 製品 / 素材: 一覧 + 行アクション「移動」（在庫移動 = 工場・保管場所・棚の
 *   間の移動。StockTransferModal）
 * - 仕掛品: 進行中指示書の工程別仕掛数（旧 PD04 の WIP ビュー）
 * - ロケーション: 工場 → 保管場所 → 棚 の在庫を視覚表示
 */

import {
  Anchor,
  Badge,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconArrowsExchange,
  IconBoxSeam,
  IconBuildingWarehouse,
  IconMap2,
  IconProgress,
  IconSearch,
  IconStack2,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { InventoryBadge } from "@/components/production/InventoryBadge";
import { GhostButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloorMapCanvas } from "@/components/ui/FloorMapCanvas";
import { ListShell } from "@/components/ui/shells";
import {
  useTabParam,
  useUrlSelectState,
  useUrlStringState,
} from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate } from "@/lib/format";
import type { MaterialInventoryRow } from "./materials/model";
import type { ProductInventoryRow, WipRow } from "./products/model";
import {
  StockTransferModal,
  type TransferFactoryOption,
  type TransferSource,
} from "./StockTransferModal";

const KIND_OPTIONS = [
  { value: "FINISHED", label: "完成品" },
  { value: "SEMI_FINISHED", label: "半製品" },
];

/** 保管場所 / 棚 のセル表示。 */
function storageCell(r: {
  storageLocationName: string | null;
  shelfCode: string | null;
}): string {
  if (!r.storageLocationName) return "未割当";
  return r.shelfCode
    ? `${r.storageLocationName} / ${r.shelfCode}`
    : r.storageLocationName;
}

export function UnifiedInventory({
  productRows,
  materialRows,
  wipRows,
  factories,
}: {
  productRows: ProductInventoryRow[];
  materialRows: MaterialInventoryRow[];
  wipRows: WipRow[];
  factories: TransferFactoryOption[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [tab, setTab] = useTabParam("products");
  const [search, setSearch] = useUrlStringState("q");
  const [factory, setFactory] = useUrlSelectState("factory");
  const [kind, setKind] = useUrlSelectState("kind");
  const [transferSource, setTransferSource] = useState<TransferSource | null>(
    null,
  );

  const reset = () => {
    setSearch(null);
    setFactory(null);
    setKind(null);
  };

  const factoryOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of productRows) if (r.factoryName) names.add(r.factoryName);
    for (const r of materialRows) if (r.factoryName) names.add(r.factoryName);
    return [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }, [productRows, materialRows]);

  const filteredProducts = productRows.filter((r) => {
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

  const filteredMaterials = materialRows.filter((r) => {
    const matchesSearch =
      !search ||
      r.materialName.includes(search) ||
      r.materialCode.includes(search);
    const matchesFactory = !factory || r.factoryName === factory;
    return matchesSearch && matchesFactory;
  });

  const filteredWip = wipRows.filter(
    (r) =>
      !search ||
      r.productName.includes(search) ||
      (r.productCode ?? "").includes(search) ||
      String(r.workOrderNumber).includes(search),
  );

  const transferButton = (source: TransferSource) => (
    <GhostButton
      leftSection={<IconArrowsExchange size={14} />}
      onClick={(e) => {
        e.stopPropagation();
        setTransferSource(source);
      }}
      size="xs"
    >
      移動
    </GhostButton>
  );

  const productColumns: Column<ProductInventoryRow>[] = [
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
      width: 120,
      sortValue: (r) => r.factoryName ?? "",
      render: (r) => r.factoryName ?? "—",
    },
    {
      key: "storage",
      header: "保管場所",
      sortable: true,
      width: 150,
      sortValue: (r) => storageCell(r),
      render: (r) => (
        <Text c={r.storageLocationName ? undefined : "dimmed"} size="sm">
          {storageCell(r)}
        </Text>
      ),
    },
    {
      key: "lotNumber",
      header: "ロット",
      align: "right",
      width: 80,
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
      width: 85,
      sortable: true,
      sortValue: (r) => r.quantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.quantity.toLocaleString("ja-JP")}
        </Text>
      ),
    },
    {
      key: "available",
      header: "利用可能",
      width: 130,
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
      width: 85,
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
      width: 105,
      sortable: true,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(r.updatedAt)}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 80,
      render: (r) =>
        transferButton({
          inventoryType: "PRODUCT",
          inventoryId: r.id,
          label: r.productCode
            ? `${r.productName}（${r.productCode}）`
            : r.productName,
          detail: r.lotNumber != null ? `ロット ${r.lotNumber}` : null,
          available: r.available,
          unit: "本",
          integerOnly: true,
          currentLabel: `${r.factoryName ?? "工場未設定"} / ${storageCell(r)}`,
        }),
    },
  ];

  const materialColumns: Column<MaterialInventoryRow>[] = [
    {
      key: "materialCode",
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
      width: 120,
      sortValue: (r) => r.factoryName ?? "",
      render: (r) => r.factoryName ?? "—",
    },
    {
      key: "storage",
      header: "保管場所",
      sortable: true,
      width: 150,
      sortValue: (r) => storageCell(r),
      render: (r) => (
        <Text c={r.storageLocationName ? undefined : "dimmed"} size="sm">
          {storageCell(r)}
        </Text>
      ),
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
      key: "available",
      header: "利用可能",
      width: 130,
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
      width: 105,
      sortable: true,
      sortValue: (r) => r.nextReceiptDate ?? "",
      render: (r) =>
        r.nextReceiptDate ? (
          <Text className="tabular-nums" size="sm">
            {formatDate(r.nextReceiptDate)}
          </Text>
        ) : (
          "—"
        ),
    },
    {
      key: "updatedAt",
      header: "更新日",
      width: 105,
      sortable: true,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {formatDate(r.updatedAt)}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 80,
      render: (r) =>
        transferButton({
          inventoryType: "MATERIAL",
          inventoryId: r.id,
          label: `${r.materialCode}（${r.materialName}）`,
          detail: null,
          available: r.available,
          unit: r.unit,
          integerOnly: false,
          currentLabel: `${r.factoryName ?? "工場未設定"} / ${storageCell(r)}`,
        }),
    },
  ];

  return (
    <ListShell
      breadcrumbs={["生産", "在庫管理"]}
      filters={
        tab === "products" || tab === "materials" ? (
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
            {tab === "products" && (
              <Select
                clearable
                data={KIND_OPTIONS}
                flex={isMobile ? 1 : undefined}
                onChange={setKind}
                placeholder="区分"
                value={kind}
                w={isMobile ? undefined : 130}
              />
            )}
          </>
        ) : undefined
      }
      onReset={reset}
      search={
        tab === "locations" ? undefined : (
          <TextInput
            leftSection={<IconSearch size={14} />}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder={
              tab === "materials"
                ? "素材コード・素材名で検索"
                : tab === "wip"
                  ? "製品名・指示書番号で検索"
                  : "製品名・製品コードで検索"
            }
            value={search}
          />
        )
      }
      title="在庫管理"
    >
      <Tabs onChange={setTab} value={tab}>
        <Tabs.List mb="sm">
          <Tabs.Tab leftSection={<IconBoxSeam size={14} />} value="products">
            製品
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconStack2 size={14} />} value="materials">
            素材
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconProgress size={14} />} value="wip">
            仕掛品
          </Tabs.Tab>
          <Tabs.Tab
            leftSection={<IconBuildingWarehouse size={14} />}
            value="locations"
          >
            ロケーション
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="products">
          <DataTable
            columns={productColumns}
            data={filteredProducts}
            defaultSort={{ key: "updatedAt", dir: "desc" }}
            emptyIcon={<IconBoxSeam size={24} />}
            emptyMessage="製品在庫がありません"
            getRowId={(r) => r.id}
            onRowClick={(r) =>
              router.push(`/production/inventory/products/${r.id}`)
            }
            renderCard={(r) => (
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack className="min-w-0" gap={3}>
                  <Text fw={600} size="sm" truncate>
                    {r.productName}
                  </Text>
                  <Group gap="md">
                    <Text c="dimmed" size="xs">
                      {r.factoryName ?? "工場未設定"} / {storageCell(r)}
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
        </Tabs.Panel>

        <Tabs.Panel value="materials">
          <DataTable
            columns={materialColumns}
            data={filteredMaterials}
            defaultSort={{ key: "updatedAt", dir: "desc" }}
            emptyIcon={<IconStack2 size={24} />}
            emptyMessage="素材在庫がありません"
            getRowId={(r) => r.id}
            onRowClick={(r) =>
              router.push(`/production/inventory/materials/${r.id}`)
            }
            renderCard={(r) => (
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack className="min-w-0" gap={3}>
                  <Text ff="mono" fw={600} size="sm" truncate>
                    {r.materialCode}
                  </Text>
                  <Text c="dimmed" size="xs" truncate>
                    {r.materialName}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {r.factoryName ?? "工場未設定"} / {storageCell(r)}
                  </Text>
                  <Text size="xs">
                    在庫 {r.quantity.toLocaleString("ja-JP")} {r.unit} /
                    利用可能 {r.available.toLocaleString("ja-JP")}
                  </Text>
                </Stack>
                <Text c="dimmed" className="shrink-0" size="xs">
                  {formatDate(r.updatedAt)}
                </Text>
              </Group>
            )}
            urlState
          />
        </Tabs.Panel>

        <Tabs.Panel value="wip">
          <WipList rows={filteredWip} />
        </Tabs.Panel>

        <Tabs.Panel value="locations">
          <LocationView
            factories={factories}
            materialRows={materialRows}
            onTransfer={setTransferSource}
            productRows={productRows}
          />
        </Tabs.Panel>
      </Tabs>

      {transferSource && (
        <StockTransferModal
          factories={factories}
          onClose={() => setTransferSource(null)}
          onDone={() => {
            setTransferSource(null);
            router.refresh();
          }}
          source={transferSource}
        />
      )}
    </ListShell>
  );
}

/** 仕掛品リスト — 製品ごとにグループ化した工程別仕掛数テーブル（旧 PD04）。 */
function WipList({ rows }: { rows: WipRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconProgress size={24} />}
        message="進行中の仕掛品はありません"
      />
    );
  }

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
          {groups.map((g) => {
            const total = g.items.reduce((s, r) => s + r.wip, 0);
            return <WipGroupRows group={g} key={g.key} total={total} />;
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function WipGroupRows({
  group,
  total,
}: {
  group: { key: string; label: string; items: WipRow[] };
  total: number;
}) {
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

/** 在庫 1 アイテムのチップ（ロケーションビュー内）。 */
interface LocationStockItem {
  key: string;
  kind: "PRODUCT" | "MATERIAL";
  label: string;
  sub: string | null;
  quantity: number;
  unit: string;
  source: TransferSource;
}

/**
 * ロケーションビュー — 工場を選び、保管場所 → 棚 の在庫を視覚表示する。
 * 未割当（保管場所なし）と 棚未割当（場所直下）も専用枠で表示。
 */
function LocationView({
  factories,
  productRows,
  materialRows,
  onTransfer,
}: {
  factories: TransferFactoryOption[];
  productRows: ProductInventoryRow[];
  materialRows: MaterialInventoryRow[];
  onTransfer: (source: TransferSource) => void;
}) {
  const [factoryId, setFactoryId] = useState<string | null>(
    factories[0] ? String(factories[0].id) : null,
  );
  const selected = factories.find((f) => String(f.id) === factoryId) ?? null;

  // フロアマップ（端末管理と共用の図面）のピン選択 → 該当ロケーションカードへ
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [selectedLocId, setSelectedLocId] = useState<number | null>(null);
  const cardRefs = useRef(new Map<number, HTMLDivElement>());

  if (!selected) {
    return (
      <EmptyState
        icon={<IconBuildingWarehouse size={24} />}
        message="工場が登録されていません"
      />
    );
  }

  // 選択工場の在庫をロケーション別に整理
  const inFactory = {
    products: productRows.filter(
      (r) => r.factoryId === selected.id && r.quantity !== 0,
    ),
    materials: materialRows.filter(
      (r) => r.factoryId === selected.id && r.quantity !== 0,
    ),
  };

  const itemOf = (
    r: ProductInventoryRow | MaterialInventoryRow,
    kind: "PRODUCT" | "MATERIAL",
  ): LocationStockItem =>
    kind === "PRODUCT"
      ? (() => {
          const p = r as ProductInventoryRow;
          return {
            key: `p:${p.id}`,
            kind,
            label: p.productName,
            sub: p.lotNumber != null ? `ロット ${p.lotNumber}` : null,
            quantity: p.quantity,
            unit: "本",
            source: {
              inventoryType: "PRODUCT",
              inventoryId: p.id,
              label: p.productCode
                ? `${p.productName}（${p.productCode}）`
                : p.productName,
              detail: p.lotNumber != null ? `ロット ${p.lotNumber}` : null,
              available: p.available,
              unit: "本",
              integerOnly: true,
              currentLabel: `${p.factoryName ?? "—"} / ${storageCell(p)}`,
            },
          };
        })()
      : (() => {
          const m = r as MaterialInventoryRow;
          return {
            key: `m:${m.id}`,
            kind,
            label: m.materialCode,
            sub: m.materialName,
            quantity: m.quantity,
            unit: m.unit,
            source: {
              inventoryType: "MATERIAL",
              inventoryId: m.id,
              label: `${m.materialCode}（${m.materialName}）`,
              detail: null,
              available: m.available,
              unit: m.unit,
              integerOnly: false,
              currentLabel: `${m.factoryName ?? "—"} / ${storageCell(m)}`,
            },
          };
        })();

  const itemsAt = (
    locationId: number | null,
    shelfId: number | null,
  ): LocationStockItem[] => [
    ...inFactory.products
      .filter(
        (r) => r.storageLocationId === locationId && r.shelfId === shelfId,
      )
      .map((r) => itemOf(r, "PRODUCT")),
    ...inFactory.materials
      .filter(
        (r) => r.storageLocationId === locationId && r.shelfId === shelfId,
      )
      .map((r) => itemOf(r, "MATERIAL")),
  ];

  const unassigned = itemsAt(null, null);

  const chip = (item: LocationStockItem) => (
    <Paper key={item.key} px="xs" py={4} radius="sm" withBorder>
      <Group gap={6} wrap="nowrap">
        {item.kind === "PRODUCT" ? (
          <IconBoxSeam color="var(--mantine-color-violet-6)" size={13} />
        ) : (
          <IconStack2 color="var(--mantine-color-teal-6)" size={13} />
        )}
        <div style={{ minWidth: 0 }}>
          <Text size="xs" truncate>
            {item.label}
            {item.sub && (
              <Text c="dimmed" component="span" size="xs">
                {" "}
                {item.sub}
              </Text>
            )}
          </Text>
        </div>
        <Text className="tabular-nums" fw={600} size="xs">
          {item.quantity.toLocaleString("ja-JP")}
          {item.unit}
        </Text>
        <GhostButton
          onClick={() => onTransfer(item.source)}
          px={4}
          size="compact-xs"
        >
          <IconArrowsExchange size={12} />
        </GhostButton>
      </Group>
    </Paper>
  );

  // フロアマップ（端末管理 SY09 と共用）: 配置済み保管場所のピンを表示し、
  // クリックで下のロケーションカード（棚ダイアグラム）へスクロール・ハイライト
  const activeMap =
    selected.floorMaps.find((m) => m.id === activeMapId) ??
    selected.floorMaps[0] ??
    null;
  const placedLocs = activeMap
    ? selected.locations.filter((l) => l.floorMapId === activeMap.id)
    : [];
  const selectPin = (locId: number) => {
    setSelectedLocId(locId);
    requestAnimationFrame(() => {
      cardRefs.current
        .get(locId)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  return (
    <Stack gap="md">
      <Select
        allowDeselect={false}
        data={factories.map((f) => ({ value: String(f.id), label: f.name }))}
        label="工場"
        onChange={(v) => {
          setFactoryId(v);
          setActiveMapId(null);
          setSelectedLocId(null);
        }}
        value={factoryId}
        w={240}
      />

      {activeMap && placedLocs.length > 0 && (
        <Paper p="md" radius="md" withBorder>
          <Group justify="space-between" mb="sm" wrap="wrap">
            <Group gap="xs">
              <IconMap2 color="var(--mantine-color-gray-6)" size={18} />
              <Text fw={600} size="sm">
                フロアマップ
              </Text>
              <Text c="dimmed" size="xs">
                ピンをクリックで棚の内訳へ
              </Text>
            </Group>
            {selected.floorMaps.length > 1 && (
              <Tabs onChange={setActiveMapId} value={activeMap.id}>
                <Tabs.List>
                  {selected.floorMaps.map((m) => (
                    <Tabs.Tab key={m.id} value={m.id}>
                      {m.name}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            )}
          </Group>
          <FloorMapCanvas
            imageAlt={`フロアマップ: ${activeMap.name}`}
            imageUrl={
              activeMap.hasImage
                ? `/api/kiosk/floor-maps/${activeMap.id}/image`
                : null
            }
            onBackgroundClick={() => setSelectedLocId(null)}
            onSelect={(id) => selectPin(Number(id))}
            pins={placedLocs.map((l) => {
              const count =
                itemsAt(l.id, null).length +
                l.shelves.reduce((s, sh) => s + itemsAt(l.id, sh.id).length, 0);
              return {
                id: String(l.id),
                x: l.mapX ?? 50,
                y: l.mapY ?? 50,
                label: `${l.name}（${l.code}）｜在庫 ${count} 件`,
                selected: selectedLocId === l.id,
                icon: (
                  <IconBuildingWarehouse
                    color={
                      selectedLocId === l.id
                        ? "var(--mantine-color-blue-6)"
                        : "var(--mantine-color-violet-6)"
                    }
                    fill={
                      selectedLocId === l.id
                        ? "var(--mantine-color-blue-1)"
                        : "var(--mantine-color-violet-1)"
                    }
                    size={26}
                    stroke={1.8}
                  />
                ),
              };
            })}
          />
        </Paper>
      )}

      {selected.locations.length === 0 && unassigned.length === 0 ? (
        <EmptyState
          icon={<IconBuildingWarehouse size={24} />}
          message="この工場には保管場所も在庫もありません（保管場所は 工場マスタ MS0B で登録）"
        />
      ) : (
        <>
          {selected.locations.map((loc) => {
            const atLocation = itemsAt(loc.id, null);
            return (
              <Paper
                key={loc.id}
                p="md"
                radius="md"
                ref={(el) => {
                  if (el) cardRefs.current.set(loc.id, el);
                  else cardRefs.current.delete(loc.id);
                }}
                style={{
                  borderColor:
                    selectedLocId === loc.id
                      ? "var(--mantine-color-blue-5)"
                      : undefined,
                }}
                withBorder
              >
                <Group gap="xs" mb="sm">
                  <IconBuildingWarehouse
                    color="var(--mantine-color-gray-6)"
                    size={16}
                  />
                  <Text fw={600} size="sm">
                    {loc.name}
                  </Text>
                  <Text c="dimmed" ff="mono" size="xs">
                    {loc.code}
                  </Text>
                </Group>
                {loc.shelves.length === 0 && atLocation.length === 0 ? (
                  <Text c="dimmed" size="xs">
                    在庫なし
                  </Text>
                ) : (
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                    {loc.shelves.map((shelf) => {
                      const atShelf = itemsAt(loc.id, shelf.id);
                      return (
                        <Paper
                          bg="var(--mantine-color-default-hover)"
                          key={shelf.id}
                          p="sm"
                          radius="sm"
                        >
                          <Group gap={6} mb={atShelf.length ? 6 : 0}>
                            <Text ff="mono" fw={600} size="xs">
                              {shelf.code}
                            </Text>
                            {shelf.name && (
                              <Text c="dimmed" size="xs">
                                {shelf.name}
                              </Text>
                            )}
                          </Group>
                          {atShelf.length === 0 ? (
                            <Text c="dimmed" size="xs">
                              空き
                            </Text>
                          ) : (
                            <Stack gap={4}>{atShelf.map(chip)}</Stack>
                          )}
                        </Paper>
                      );
                    })}
                    {atLocation.length > 0 && (
                      <Paper
                        bg="var(--mantine-color-default-hover)"
                        p="sm"
                        radius="sm"
                      >
                        <Text c="dimmed" fw={600} mb={6} size="xs">
                          棚未割当
                        </Text>
                        <Stack gap={4}>{atLocation.map(chip)}</Stack>
                      </Paper>
                    )}
                  </SimpleGrid>
                )}
              </Paper>
            );
          })}

          {unassigned.length > 0 && (
            <Paper p="md" radius="md" withBorder>
              <Text c="dimmed" fw={600} mb="sm" size="sm">
                未割当（保管場所なし）
              </Text>
              <Group gap="xs" wrap="wrap">
                {unassigned.map(chip)}
              </Group>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
