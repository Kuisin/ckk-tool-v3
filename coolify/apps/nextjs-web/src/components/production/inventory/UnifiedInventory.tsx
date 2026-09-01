"use client";

/**
 * UnifiedInventory — 在庫管理 (PD04) 統合ビュー。
 *
 * 製品在庫・素材在庫・仕掛品を 1 アプリに統合し、タブで切り替える
 * （旧 PD04 製品在庫 / PD05 素材在庫 は本アプリへ統合 — 旧 URL はリダイレクト）。
 * - 製品 / 素材: 一覧 + 行アクション「移動」（在庫移動 = 拠点・保管場所・棚の
 *   間の移動。StockTransferModal）
 * - 仕掛品: 進行中指示書の工程別仕掛数（旧 PD04 の WIP ビュー）
 * - ロケーション: 拠点 → 保管場所 → 棚 の在庫を視覚表示
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
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { InventoryBadge } from "@/components/production/InventoryBadge";
import { AppTabs } from "@/components/ui/AppTabs";
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
import type { MaterialInventoryRow } from "./materials/model";
import type { ProductInventoryRow, WipRow } from "./products/model";
import {
  StockTransferModal,
  type TransferPlantOption,
  type TransferSource,
} from "./StockTransferModal";

/** 保管場所 / 棚 のセル表示。 */
function storageCell(
  tr: (key: string) => string,
  r: {
    storageLocationName: string | null;
    shelfCode: string | null;
  },
): string {
  if (!r.storageLocationName) return tr("common.unassigned");
  return r.shelfCode
    ? `${r.storageLocationName} / ${r.shelfCode}`
    : r.storageLocationName;
}

export function UnifiedInventory({
  productRows,
  materialRows,
  wipRows,
  plants,
}: {
  productRows: ProductInventoryRow[];
  materialRows: MaterialInventoryRow[];
  wipRows: WipRow[];
  plants: TransferPlantOption[];
}) {
  const tr = useTranslations();
  const KIND_OPTIONS = [
    { value: "FINISHED", label: tr("common.finishedGoods") },
    { value: "SEMI_FINISHED", label: tr("common.semiFinished") },
  ];
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [tab, setTab] = useTabParam("products");
  const [search, setSearch] = useUrlStringState("q");
  const [plant, setPlant] = useUrlSelectState("plant");
  const [kind, setKind] = useUrlSelectState("kind");
  const [transferSource, setTransferSource] = useState<TransferSource | null>(
    null,
  );

  const reset = () => {
    setSearch(null);
    setPlant(null);
    setKind(null);
  };

  const plantOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of productRows) if (r.plantName) names.add(r.plantName);
    for (const r of materialRows) if (r.plantName) names.add(r.plantName);
    return [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }, [productRows, materialRows]);

  const filteredProducts = productRows.filter((r) => {
    const matchesSearch =
      !search ||
      r.productName.includes(search) ||
      (r.productCode ?? "").includes(search);
    const matchesPlant = !plant || r.plantName === plant;
    const matchesKind =
      !kind ||
      (kind === "SEMI_FINISHED" ? r.isSemiFinished : !r.isSemiFinished);
    return matchesSearch && matchesPlant && matchesKind;
  });

  const filteredMaterials = materialRows.filter((r) => {
    const matchesSearch =
      !search ||
      r.materialName.includes(search) ||
      r.materialCode.includes(search);
    const matchesPlant = !plant || r.plantName === plant;
    return matchesSearch && matchesPlant;
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
      {tr("production.inventory.move2")}
    </GhostButton>
  );

  const productColumns: Column<ProductInventoryRow>[] = [
    {
      key: "productName",
      header: tr("common.product"),
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
      key: "plantName",
      header: tr("common.site"),
      sortable: true,
      width: 120,
      sortValue: (r) => r.plantName ?? "",
      render: (r) => r.plantName ?? "—",
    },
    {
      key: "storage",
      header: tr("common.storageLocations"),
      sortable: true,
      width: 150,
      sortValue: (r) => storageCell(tr, r),
      render: (r) => (
        <Text c={r.storageLocationName ? undefined : "dimmed"} size="sm">
          {storageCell(tr, r)}
        </Text>
      ),
    },
    {
      key: "lotNumber",
      header: tr("common.lot"),
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
      header: tr("common.onHand"),
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
      header: tr("common.available"),
      width: 130,
      sortable: true,
      sortValue: (r) => r.available,
      render: (r) => (
        <InventoryBadge
          available={r.available}
          reserved={r.reservedQuantity}
          unit={tr("common.pcs")}
        />
      ),
    },
    {
      key: "kind",
      header: tr("common.type"),
      width: 85,
      sortValue: (r) => (r.isSemiFinished ? 1 : 0),
      render: (r) =>
        r.isSemiFinished ? (
          <Badge color="orange" variant="light">
            {tr("common.semiFinished")}
          </Badge>
        ) : (
          <Badge color="gray" variant="light">
            {tr("common.finishedGoods")}
          </Badge>
        ),
    },
    {
      key: "updatedAt",
      header: tr("common.updated"),
      width: 105,
      sortable: true,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(r.updatedAt)}
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
          detail:
            r.lotNumber != null
              ? tr("production.inventory.lotN", { number: r.lotNumber })
              : null,
          available: r.available,
          unit: tr("common.pcs"),
          integerOnly: true,
          currentLabel: `${r.plantName ?? tr("production.inventory.noSiteSet")} / ${storageCell(tr, r)}`,
        }),
    },
  ];

  const materialColumns: Column<MaterialInventoryRow>[] = [
    {
      key: "materialCode",
      header: tr("common.materials"),
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
      key: "plantName",
      header: tr("common.site"),
      sortable: true,
      width: 120,
      sortValue: (r) => r.plantName ?? "",
      render: (r) => r.plantName ?? "—",
    },
    {
      key: "storage",
      header: tr("common.storageLocations"),
      sortable: true,
      width: 150,
      sortValue: (r) => storageCell(tr, r),
      render: (r) => (
        <Text c={r.storageLocationName ? undefined : "dimmed"} size="sm">
          {storageCell(tr, r)}
        </Text>
      ),
    },
    {
      key: "quantity",
      header: tr("common.onHand"),
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
      header: tr("common.available"),
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
      header: tr("common.nextReceipt"),
      width: 105,
      sortable: true,
      sortValue: (r) => r.nextReceiptDate ?? "",
      render: (r) =>
        r.nextReceiptDate ? (
          <Text className="tabular-nums" size="sm">
            {fmt.date(r.nextReceiptDate)}
          </Text>
        ) : (
          "—"
        ),
    },
    {
      key: "updatedAt",
      header: tr("common.updated"),
      width: 105,
      sortable: true,
      sortValue: (r) => r.updatedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(r.updatedAt)}
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
          currentLabel: `${r.plantName ?? tr("production.inventory.noSiteSet")} / ${storageCell(tr, r)}`,
        }),
    },
  ];

  return (
    <ListShell
      breadcrumbs={[tr("common.production"), tr("common.inventory")]}
      filters={
        tab === "products" || tab === "materials" ? (
          <>
            <Select
              clearable
              data={plantOptions}
              flex={isMobile ? 1 : undefined}
              onChange={setPlant}
              placeholder={tr("common.site")}
              value={plant}
              w={isMobile ? undefined : 160}
            />
            {tab === "products" && (
              <Select
                clearable
                data={KIND_OPTIONS}
                flex={isMobile ? 1 : undefined}
                onChange={setKind}
                placeholder={tr("common.type")}
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
                ? tr("production.inventory.searchByMaterialCodeOrName")
                : tab === "wip"
                  ? tr("production.inventory.searchByProductNameOrWork")
                  : tr("production.inventory.searchByProductNameOrCode")
            }
            value={search}
          />
        )
      }
      title={tr("common.inventory")}
    >
      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List mb="sm">
          <Tabs.Tab leftSection={<IconBoxSeam size={14} />} value="products">
            {tr("common.product")}
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconStack2 size={14} />} value="materials">
            {tr("common.materials")}
          </Tabs.Tab>
          <Tabs.Tab leftSection={<IconProgress size={14} />} value="wip">
            {tr("production.inventory.wIP")}
          </Tabs.Tab>
          <Tabs.Tab
            leftSection={<IconBuildingWarehouse size={14} />}
            value="locations"
          >
            {tr("production.inventory.location")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="products">
          <DataTable
            columns={productColumns}
            data={filteredProducts}
            defaultSort={{ key: "updatedAt", dir: "desc" }}
            emptyIcon={<IconBoxSeam size={24} />}
            emptyMessage={tr("production.inventory.thereIsNoProductStock")}
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
                      {r.plantName ?? tr("production.inventory.noSiteSet")} /{" "}
                      {storageCell(tr, r)}
                    </Text>
                    {r.lotNumber != null && (
                      <Text c="dimmed" ff="mono" size="xs">
                        {tr("production.inventory.lotN", {
                          number: r.lotNumber,
                        })}
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
                      {tr("common.semiFinished")}
                    </Badge>
                  )}
                  <Text c="dimmed" size="xs">
                    {fmt.date(r.updatedAt)}
                  </Text>
                </Stack>
              </Group>
            )}
            settingsKey="products"
            urlState
          />
        </Tabs.Panel>

        <Tabs.Panel value="materials">
          <DataTable
            columns={materialColumns}
            data={filteredMaterials}
            defaultSort={{ key: "updatedAt", dir: "desc" }}
            emptyIcon={<IconStack2 size={24} />}
            emptyMessage={tr("production.inventory.thereIsNoMaterialStock")}
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
                    {r.plantName ?? tr("production.inventory.noSiteSet")} /{" "}
                    {storageCell(tr, r)}
                  </Text>
                  <Text size="xs">
                    在庫 {r.quantity.toLocaleString("ja-JP")} {r.unit} /
                    利用可能 {r.available.toLocaleString("ja-JP")}
                  </Text>
                </Stack>
                <Text c="dimmed" className="shrink-0" size="xs">
                  {fmt.date(r.updatedAt)}
                </Text>
              </Group>
            )}
            settingsKey="materials"
            urlState
          />
        </Tabs.Panel>

        <Tabs.Panel value="wip">
          <WipList rows={filteredWip} />
        </Tabs.Panel>

        <Tabs.Panel value="locations">
          <LocationView
            materialRows={materialRows}
            onTransfer={setTransferSource}
            plants={plants}
            productRows={productRows}
          />
        </Tabs.Panel>
      </AppTabs>

      {transferSource && (
        <StockTransferModal
          onClose={() => setTransferSource(null)}
          onDone={() => {
            setTransferSource(null);
            router.refresh();
          }}
          plants={plants}
          source={transferSource}
        />
      )}
    </ListShell>
  );
}

/** 仕掛品リスト — 製品ごとにグループ化した工程別仕掛数テーブル（旧 PD04）。 */
function WipList({ rows }: { rows: WipRow[] }) {
  const tr = useTranslations();
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconProgress size={24} />}
        message={tr("production.inventory.thereIsNoWorkInProgress")}
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
            <Table.Th w={120}>{tr("common.workOrderNumber")}</Table.Th>
            <Table.Th>{tr("production.inventory.step")}</Table.Th>
            <Table.Th ta="right" w={110}>
              {tr("production.inventory.wIP2")}
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
 * ロケーションビュー — 拠点を選び、保管場所 → 棚 の在庫を視覚表示する。
 * 未割当（保管場所なし）と 棚未割当（場所直下）も専用枠で表示。
 */
function LocationView({
  plants,
  productRows,
  materialRows,
  onTransfer,
}: {
  plants: TransferPlantOption[];
  productRows: ProductInventoryRow[];
  materialRows: MaterialInventoryRow[];
  onTransfer: (source: TransferSource) => void;
}) {
  const tr = useTranslations();
  const [plantId, setPlantId] = useState<string | null>(
    plants[0] ? String(plants[0].id) : null,
  );
  const selected = plants.find((f) => String(f.id) === plantId) ?? null;

  // フロアマップ（端末管理と共用の図面）のピン選択 → 該当ロケーションカードへ
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [selectedLocId, setSelectedLocId] = useState<number | null>(null);
  const cardRefs = useRef(new Map<number, HTMLDivElement>());

  if (!selected) {
    return (
      <EmptyState
        icon={<IconBuildingWarehouse size={24} />}
        message={tr("production.inventory.noSitesAreRegistered")}
      />
    );
  }

  // 選択拠点の在庫をロケーション別に整理
  const inPlant = {
    products: productRows.filter(
      (r) => r.plantId === selected.id && r.quantity !== 0,
    ),
    materials: materialRows.filter(
      (r) => r.plantId === selected.id && r.quantity !== 0,
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
            sub:
              p.lotNumber != null
                ? tr("production.inventory.lotN", { number: p.lotNumber })
                : null,
            quantity: p.quantity,
            unit: tr("common.pcs"),
            source: {
              inventoryType: "PRODUCT",
              inventoryId: p.id,
              label: p.productCode
                ? `${p.productName}（${p.productCode}）`
                : p.productName,
              detail:
                p.lotNumber != null
                  ? tr("production.inventory.lotN", { number: p.lotNumber })
                  : null,
              available: p.available,
              unit: tr("common.pcs"),
              integerOnly: true,
              currentLabel: `${p.plantName ?? "—"} / ${storageCell(tr, p)}`,
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
              currentLabel: `${m.plantName ?? "—"} / ${storageCell(tr, m)}`,
            },
          };
        })();

  const itemsAt = (
    locationId: number | null,
    shelfId: number | null,
  ): LocationStockItem[] => [
    ...inPlant.products
      .filter(
        (r) => r.storageLocationId === locationId && r.shelfId === shelfId,
      )
      .map((r) => itemOf(r, "PRODUCT")),
    ...inPlant.materials
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
        data={plants.map((f) => ({ value: String(f.id), label: f.name }))}
        label={tr("common.site")}
        onChange={(v) => {
          setPlantId(v);
          setActiveMapId(null);
          setSelectedLocId(null);
        }}
        value={plantId}
        w={240}
      />

      {activeMap && placedLocs.length > 0 && (
        <Paper p="md" radius="md" withBorder>
          <Group justify="space-between" mb="sm" wrap="wrap">
            <Group gap="xs">
              <IconMap2 color="var(--mantine-color-gray-6)" size={18} />
              <Text fw={600} size="sm">
                {tr("common.floorMap")}
              </Text>
              <Text c="dimmed" size="xs">
                {tr("production.inventory.clickAPinForTheShelf")}
              </Text>
            </Group>
            {selected.floorMaps.length > 1 && (
              <AppTabs onChange={setActiveMapId} value={activeMap.id}>
                <Tabs.List>
                  {selected.floorMaps.map((m) => (
                    <Tabs.Tab key={m.id} value={m.id}>
                      {m.name}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </AppTabs>
            )}
          </Group>
          <FloorMapCanvas
            imageAlt={tr("production.inventory.floorMapAlt", {
              name: activeMap.name,
            })}
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
                label: tr("production.inventory.pinLabelWithStockCount", {
                  name: l.name,
                  code: l.code,
                  count,
                }),
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
          message={tr("production.inventory.thisSiteHasNoStorageLocations")}
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
                    {tr("production.inventory.noStock")}
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
                              {tr("production.inventory.free")}
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
                          {tr("common.noShelfAssigned")}
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
                {tr("production.inventory.unassignedNoStorageLocation")}
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
