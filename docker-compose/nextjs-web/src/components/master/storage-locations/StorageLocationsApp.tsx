"use client";

/**
 * StorageLocationsApp — 保管場所 (MS0E, design.md §8.1).
 *
 * 全拠点横断の保管場所一覧 + 拠点 Select。拠点を選ぶと（Select または行
 * クリック）、その拠点の管理パネル（StorageLocationsPanel — 追加/編集/棚/
 * フロアマップピン配置。旧 拠点詳細「保管場所」タブと同一 UX）に切り替わる。
 * 選択拠点は URL `?plant=` に保持（サーバー再取得のため server モード）。
 */

import {
  Badge,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconMapPin, IconPackages, IconSearch } from "@tabler/icons-react";
import type { PlantFloorMapRef } from "@/components/master/plants/FloorMapsPanel";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { ListShell } from "@/components/ui/shells";
import { useUrlPatcher, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type StorageLocationRow,
  StorageLocationsPanel,
} from "./StorageLocationsPanel";

/** 全拠点横断一覧の 1 行。 */
export interface StorageLocationListRow {
  id: number;
  plantId: number;
  plantCode: string;
  plantName: string;
  code: string;
  nameJa: string;
  shelfCount: number;
  /** フロアマップにピン配置済みか。 */
  placed: boolean;
  isActive: boolean;
}

export function StorageLocationsApp({
  plantOptions,
  rows,
  selected,
}: {
  plantOptions: { value: string; label: string }[];
  rows: StorageLocationListRow[];
  /** `?plant=` で選択中の拠点の管理データ（未選択は null）。 */
  selected: {
    plantId: number;
    locations: StorageLocationRow[];
    floorMaps: PlantFloorMapRef[];
  } | null;
}) {
  const isMobile = useIsMobile();
  // 拠点選択はサーバー再取得が必要 → server モードで URL に反映
  const patch = useUrlPatcher("server");
  const [search, setSearch] = useUrlStringState("q");

  const setPlant = (v: string | null) => patch({ plant: v, page: null });

  const reset = () => {
    setSearch(null);
    setPlant(null);
  };

  const filtered = rows.filter(
    (r) =>
      !search ||
      r.code.includes(search) ||
      r.nameJa.includes(search) ||
      r.plantCode.includes(search) ||
      r.plantName.includes(search),
  );

  const columns: Column<StorageLocationListRow>[] = [
    {
      key: "plant",
      header: "拠点",
      sortable: true,
      width: 200,
      sortValue: (r) => r.plantCode,
      render: (r) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm">{r.plantName}</Text>
          <DocNumber c="dimmed">{r.plantCode}</DocNumber>
        </Group>
      ),
    },
    {
      key: "code",
      header: "コード",
      sortable: true,
      width: 130,
      sortValue: (r) => r.code,
      render: (r) => <DocNumber>{r.code}</DocNumber>,
    },
    {
      key: "name",
      header: "名称",
      sortable: true,
      sortValue: (r) => r.nameJa,
      render: (r) => r.nameJa,
    },
    {
      key: "shelfCount",
      header: "棚数",
      sortable: true,
      width: 90,
      sortValue: (r) => r.shelfCount,
      render: (r) => (
        <Text className="tabular-nums" size="sm" ta="right">
          {r.shelfCount}
        </Text>
      ),
    },
    {
      key: "placed",
      header: "マップ配置",
      sortable: true,
      hideable: true,
      width: 110,
      sortValue: (r) => (r.placed ? 1 : 0),
      render: (r) =>
        r.placed ? (
          <Badge
            color="violet"
            leftSection={<IconMapPin size={10} />}
            size="xs"
            variant="light"
          >
            配置済
          </Badge>
        ) : (
          <Text c="dimmed" size="sm">
            —
          </Text>
        ),
    },
    {
      key: "isActive",
      header: "状態",
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
  ];

  return (
    <ListShell
      breadcrumbs={["マスタ", "保管場所"]}
      filters={
        <Select
          clearable
          data={plantOptions}
          onChange={setPlant}
          placeholder="拠点を選択して管理"
          searchable
          value={selected ? String(selected.plantId) : null}
          w={isMobile ? 180 : 240}
        />
      }
      onReset={reset}
      search={
        selected ? undefined : (
          <TextInput
            leftSection={<IconSearch size={14} />}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="コード・名称・拠点で検索"
            value={search}
          />
        )
      }
      title="保管場所"
    >
      {selected ? (
        <StorageLocationsPanel
          floorMaps={selected.floorMaps}
          locations={selected.locations}
          plantId={selected.plantId}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          defaultSort={{ key: "plant", dir: "asc" }}
          emptyIcon={<IconPackages size={24} />}
          emptyMessage="保管場所がありません（拠点を選択して追加）"
          getRowId={(r) => String(r.id)}
          onRowClick={(r) => setPlant(String(r.plantId))}
          renderCard={(r) => (
            <Paper p="sm" radius="sm" withBorder>
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack gap={3} style={{ minWidth: 0 }}>
                  <DocNumber c="dimmed">{r.code}</DocNumber>
                  <Text fw={600} size="sm" truncate>
                    {r.nameJa}
                  </Text>
                  <Group gap="md" mt={2}>
                    <Text c="dimmed" size="xs">
                      {r.plantName}
                    </Text>
                    <Text c="dimmed" size="xs">
                      棚 {r.shelfCount} 件
                    </Text>
                  </Group>
                </Stack>
                <ActiveBadge active={r.isActive} />
              </Group>
            </Paper>
          )}
          urlState
        />
      )}
    </ListShell>
  );
}
