"use client";

/**
 * StockOverviewTable — 在庫一覧 (ST02, design.md §8.1 / §14)。
 *
 * **場所起点の一覧。** 「この拠点・この棚に何があるか」に答える — 品目 1 つを
 * 追う 在庫・所要量 (ST03) とは目的も入口も別なので、行から ST03 へのリンクは
 * 作らない（行そのものが答え）。読み取り専用（作る画面は無い）。
 *
 * Columns: 品目（名称 + PRODUCT/MATERIAL バッジ）/ コード / 拠点 / 保管場所・棚 /
 * ロット / 手持ち / 予約 / 利用可能 / 単位 / 更新日。
 * フィルタ: 品目名・コードでの検索 + 拠点 + 保管場所（拠点で絞り込み）+ 品目種別 +
 * 預け先（既定は自社 — 外注が持っている分は手持ちではないので、混ぜて数えない）+
 * 在庫ゼロを隠す（既定 ON — 倉庫の一覧はそこに「ある」ものを見る画面のため）。
 *
 * **預け先だけは既定が「絞らない」ではなく「自社」。** ここは在庫を数える画面
 * なので、何も選んでいない状態が自社の手持ちを指していないと、合計が嘘になる。
 */

import {
  Badge,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { IconBuildingWarehouse, IconSearch } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import type { StorageLocationOption } from "@/app/(dashboard)/inventory/stock-takes/data";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { InventoryBadge } from "@/components/production/InventoryBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { appLabelForKey, categoryLabel } from "@/lib/app-list";
import { inventoryTypeLabel, inventoryTypeOptions } from "@/lib/enum-labels";
import type { Locale } from "@/lib/i18n";
import { ITEM_TYPE_COLOR, type StockOverviewRow } from "./model";

export function StockOverviewTable({
  rows,
  plantOptions,
  storageLocationOptions,
  truncated = false,
}: {
  rows: StockOverviewRow[];
  plantOptions: { value: string; label: string }[];
  storageLocationOptions: StorageLocationOption[];
  /** 取得上限で切れている（= まだ他のバケットがある）。 */
  truncated?: boolean;
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const fmt = useFormat();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [plantId, setPlantId] = useUrlSelectState("plant");
  const [storageLocationId, setStorageLocationId] = useUrlSelectState("loc");
  const [itemType, setItemType] = useUrlSelectState("type");
  // 在庫ゼロを隠す — 既定 ON。URL には「外した」ときだけ "0" を残す
  // （既定と同じ状態はパラメータを削除して URL を短く保つ、という共通の約束）。
  const [hideZeroParam, setHideZeroParam] = useUrlSelectState("hideZero");
  const hideZero = hideZeroParam !== "0";
  // 預け先。null = 自社（既定）。URL には選んだときだけ残す。
  const [custodyBpId, setCustodyBpId] = useUrlSelectState("custody");

  const reset = () => {
    setSearch(null);
    setPlantId(null);
    setStorageLocationId(null);
    setItemType(null);
    setHideZeroParam(null);
    setCustodyBpId(null);
  };

  // 預け先の選択肢は、いま在庫を預かっている取引先だけ（空なら選択欄も出さない）。
  const custodyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.custodyBpId && r.custodyBpName)
        seen.set(r.custodyBpId, r.custodyBpName);
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [rows]);

  // 選んだ拠点の保管場所だけに絞る（StockTakeForm と同じ二段階 Select）。
  const filteredStorageLocationOptions = useMemo(() => {
    if (!plantId) return storageLocationOptions;
    const id = Number(plantId);
    return storageLocationOptions.filter((o) => o.plantId === id);
  }, [storageLocationOptions, plantId]);

  const selectPlant = (v: string | null) => {
    setPlantId(v);
    // 拠点を変えたら、その拠点に無い保管場所の選択は外す。
    if (
      v &&
      storageLocationId &&
      !storageLocationOptions.some(
        (o) => o.value === storageLocationId && o.plantId === Number(v),
      )
    ) {
      setStorageLocationId(null);
    }
  };

  const filtered = rows.filter((r) => {
    const q = search.trim();
    const matchesSearch =
      !q ||
      r.itemName.includes(q) ||
      (r.itemCode ?? "").toLowerCase().includes(q.toLowerCase());
    const matchesPlant = !plantId || String(r.plantId) === plantId;
    const matchesLocation =
      !storageLocationId || String(r.storageLocationId) === storageLocationId;
    const matchesType = !itemType || r.itemType === itemType;
    const matchesZero = !hideZero || r.quantity !== 0;
    // 既定（未選択）は**自社だけ**。預け分を黙って足すと合計が嘘になる。
    const matchesCustody = custodyBpId
      ? r.custodyBpId === custodyBpId
      : r.custodyBpId === null;
    return (
      matchesSearch &&
      matchesPlant &&
      matchesLocation &&
      matchesType &&
      matchesZero &&
      matchesCustody
    );
  });

  const summary = useMemo(() => {
    const itemIds = new Set(filtered.map((r) => r.itemId));
    const plantIds = new Set(
      filtered.map((r) => r.plantId).filter((id): id is number => id !== null),
    );
    return {
      rows: filtered.length,
      items: itemIds.size,
      sites: plantIds.size,
    };
  }, [filtered]);

  const storageCell = (r: StockOverviewRow): string => {
    if (!r.storageLocationName) return tr("common.unassigned");
    return r.shelfCode
      ? `${r.storageLocationName} / ${r.shelfCode}`
      : r.storageLocationName;
  };

  const columns: Column<StockOverviewRow>[] = [
    {
      key: "itemName",
      header: tr("inventory.stockOverview.item"),
      sortable: true,
      sortValue: (r) => r.itemName,
      render: (r) => (
        <Group gap="xs" wrap="nowrap">
          <Badge color={ITEM_TYPE_COLOR[r.itemType] ?? "gray"} variant="light">
            {inventoryTypeLabel(r.itemType, locale)}
          </Badge>
          <Text size="sm">{r.itemName}</Text>
        </Group>
      ),
    },
    {
      key: "itemCode",
      header: tr("common.code"),
      hideable: true,
      sortable: true,
      sortValue: (r) => r.itemCode ?? "",
      render: (r) =>
        r.itemCode ? (
          <Text ff="mono" size="xs">
            {r.itemCode}
          </Text>
        ) : (
          "—"
        ),
    },
    {
      key: "plantName",
      header: tr("common.site"),
      sortable: true,
      width: 120,
      sortValue: (r) => r.plantName ?? "",
      render: (r) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm">{r.plantName ?? "—"}</Text>
          {r.custodyBpName ? (
            <Badge color="orange" size="xs" variant="light">
              {tr("inventory.stockOverview.heldBy", {
                name: r.custodyBpName,
              })}
            </Badge>
          ) : null}
        </Group>
      ),
    },
    {
      key: "storage",
      header: tr("common.storageLocations"),
      sortable: true,
      width: 160,
      sortValue: (r) => storageCell(r),
      render: (r) => (
        <Text c={r.storageLocationName ? undefined : "dimmed"} size="sm">
          {storageCell(r)}
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
      width: 90,
      sortable: true,
      sortValue: (r) => r.quantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.quantity.toLocaleString(locale)}
        </Text>
      ),
    },
    {
      key: "reservedQuantity",
      header: tr("common.reserved"),
      align: "right",
      width: 90,
      hideable: true,
      sortable: true,
      sortValue: (r) => r.reservedQuantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.reservedQuantity.toLocaleString(locale)}
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
      key: "unit",
      header: tr("common.unit"),
      width: 70,
      hideable: true,
      sortValue: (r) => r.unit,
      render: (r) => r.unit,
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
  ];

  return (
    <ListShell
      breadcrumbs={[
        categoryLabel("在庫", locale), // i18n-ignore — app-list のカテゴリ名 / ja 既定値（対訳は app-list.ts が持つ）
        appLabelForKey("stock-overview", "在庫一覧", locale), // i18n-ignore — app-list のカテゴリ名 / ja 既定値（対訳は app-list.ts が持つ）
      ]}
      filters={
        <>
          <Select
            aria-label={tr("common.site")}
            clearable
            data={plantOptions}
            flex={isMobile ? 1 : undefined}
            onChange={selectPlant}
            placeholder={tr("common.selectASite")}
            searchable
            value={plantId}
            w={isMobile ? undefined : 170}
          />
          <Select
            aria-label={tr("common.storageLocations")}
            clearable
            data={filteredStorageLocationOptions}
            disabled={filteredStorageLocationOptions.length === 0}
            flex={isMobile ? 1 : undefined}
            onChange={setStorageLocationId}
            placeholder={tr("common.storageLocations")}
            searchable
            value={storageLocationId}
            w={isMobile ? undefined : 170}
          />
          <Select
            aria-label={tr("inventory.stockOverview.itemType")}
            clearable
            data={inventoryTypeOptions(locale)}
            flex={isMobile ? 1 : undefined}
            onChange={setItemType}
            placeholder={tr("inventory.stockOverview.itemType")}
            value={itemType}
            w={isMobile ? undefined : 140}
          />
          {custodyOptions.length > 0 ? (
            <Select
              aria-label={tr("inventory.stockOverview.custody")}
              clearable
              data={custodyOptions}
              flex={isMobile ? 1 : undefined}
              onChange={setCustodyBpId}
              placeholder={tr("inventory.stockOverview.custodyOwn")}
              value={custodyBpId}
              w={isMobile ? undefined : 170}
            />
          ) : null}
          <Switch
            checked={hideZero}
            label={tr("inventory.stockOverview.hideZeroStock")}
            onChange={(e) =>
              setHideZeroParam(e.currentTarget.checked ? null : "0")
            }
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          aria-label={tr("inventory.stockOverview.searchPlaceholder")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("inventory.stockOverview.searchPlaceholder")}
          value={search}
        />
      }
      title={appLabelForKey("stock-overview", "在庫一覧", locale)} // i18n-ignore — app-list のカテゴリ名 / ja 既定値（対訳は app-list.ts が持つ）
    >
      <Text c="dimmed" mb="sm" size="xs">
        {tr("inventory.stockOverview.summaryLine", {
          rows: summary.rows,
          items: summary.items,
          sites: summary.sites,
        })}
      </Text>
      {truncated ? (
        <Text c="orange" mb="sm" size="xs">
          {tr("inventory.stockOverview.truncatedNotice")}
        </Text>
      ) : null}
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "updatedAt", dir: "desc" }}
        emptyIcon={<IconBuildingWarehouse size={24} />}
        emptyMessage={tr("inventory.stockOverview.noStock")}
        getRowId={(r) => r.id}
        renderCard={(r) => (
          <Stack className="min-w-0" gap={3}>
            <Group gap="xs" wrap="nowrap">
              <Badge
                color={ITEM_TYPE_COLOR[r.itemType] ?? "gray"}
                variant="light"
              >
                {inventoryTypeLabel(r.itemType, locale)}
              </Badge>
              <Text fw={600} size="sm" truncate>
                {r.itemName}
              </Text>
            </Group>
            <Text c="dimmed" size="xs">
              {r.plantName ?? "—"} / {storageCell(r)}
            </Text>
            <Group gap="md">
              <Text size="xs">
                {tr("common.onHand")}: {r.quantity.toLocaleString(locale)}{" "}
                {r.unit}
              </Text>
              <Text size="xs">
                {tr("common.available")}: {r.available.toLocaleString(locale)}
              </Text>
            </Group>
          </Stack>
        )}
        urlState
      />
    </ListShell>
  );
}
