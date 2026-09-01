"use client";

/**
 * StorageLocationMapPanel — 保管場所アプリ (MS0E) のフロアマップ配置パネル。
 *
 * 拠点マスタ (MS0C) で管理されているフロアマップ（端末管理 SY09 と共用の
 * 図面）を「閲覧のみ」で表示し、保管場所ピンのドラッグ配置 / 配置解除だけを
 * 行う。フロア自体の追加・名称変更・図面アップロード・削除はここでは
 * できない（拠点マスタ MS0C のフロアマップタブで行う）。
 */

import { Chip, Group, Paper, Stack, Tabs, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBuildingWarehouse,
  IconMap2,
  IconMapPin,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  placeStorageLocation,
  unplaceStorageLocation,
} from "@/app/(dashboard)/master/storage-locations/actions";
import type { PlantFloorMapRef } from "@/components/master/plants/FloorMapsPanel";
import { AppTabs } from "@/components/ui/AppTabs";
import { GhostButton } from "@/components/ui/buttons";
import { FloorMapCanvas } from "@/components/ui/FloorMapCanvas";
import { useTr } from "@/hooks/useTr";

/** フロアマップに配置する保管場所ピン。 */
export interface StorageMapPin {
  id: number;
  code: string;
  nameJa: string;
  isActive: boolean;
  /** フロアマップ上のピン（%座標。null = 未配置）。 */
  floorMapId: string | null;
  mapX: number | null;
  mapY: number | null;
  shelfCount: number;
}

export function StorageLocationMapPanel({
  floorMaps,
  pins,
}: {
  floorMaps: PlantFloorMapRef[];
  pins: StorageMapPin[];
}) {
  const tr = useTr();
  const router = useRouter();
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [overlayIds, setOverlayIds] = useState<string[]>([]);
  const [, startTransition] = useTransition();
  const activeMap =
    floorMaps.find((m) => m.id === activeMapId) ?? floorMaps[0] ?? null;

  const placed = activeMap
    ? pins.filter((l) => l.floorMapId === activeMap.id)
    : [];
  const unplaced = pins.filter((l) => l.floorMapId == null && l.isActive);
  /** 重ね表示候補 = アクティブ以外の図面ありフロア。 */
  const overlayCandidates = floorMaps.filter(
    (m) => m.id !== activeMap?.id && m.hasImage,
  );
  const overlays = overlayCandidates
    .filter((m) => overlayIds.includes(m.id))
    .map((m) => ({ id: m.id, url: `/api/kiosk/floor-maps/${m.id}/image` }));

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        notifications.show({
          title: tr("エラー"),
          message: res.error ?? tr("操作に失敗しました"),
          color: "red",
        });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Group gap="xs" mb="sm">
        <IconMap2 color="var(--mantine-color-gray-6)" size={18} />
        <Text fw={600} size="sm">
          {tr("フロアマップ配置")}
        </Text>
        <Text c="dimmed" size="xs">
          {tr("保管場所ピンをドラッグで配置。図面の管理は拠点マスタ (MS0C)")}
        </Text>
      </Group>

      {floorMaps.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr(
            "この拠点にはフロアマップがありません。拠点マスタ (MS0C)\n          の「フロアマップ」タブでフロアと図面を登録してください。",
          )}
        </Text>
      ) : (
        <Stack gap="sm">
          {floorMaps.length > 1 && (
            <AppTabs
              onChange={(v) => {
                setActiveMapId(v);
                setOverlayIds([]);
              }}
              value={activeMap?.id ?? null}
            >
              <Tabs.List>
                {floorMaps.map((m) => (
                  <Tabs.Tab key={m.id} value={m.id}>
                    {m.name}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </AppTabs>
          )}

          {/* 重ね表示（スタッキング）— 他フロアの図面を低不透明度で重ねて位置合わせ */}
          {overlayCandidates.length > 0 && (
            <Group gap="xs" wrap="wrap">
              <Text c="dimmed" size="xs">
                {tr("重ね表示:")}
              </Text>
              {overlayCandidates.map((m) => (
                <Chip
                  checked={overlayIds.includes(m.id)}
                  key={m.id}
                  onChange={(checked) =>
                    setOverlayIds((prev) =>
                      checked
                        ? [...prev, m.id]
                        : prev.filter((id) => id !== m.id),
                    )
                  }
                  size="xs"
                >
                  {m.name}
                </Chip>
              ))}
            </Group>
          )}

          {activeMap && (
            <FloorMapCanvas
              editable
              imageAlt={`フロアマップ: ${activeMap.name}`}
              imageUrl={
                activeMap.hasImage
                  ? `/api/kiosk/floor-maps/${activeMap.id}/image`
                  : null
              }
              onMove={(id, x, y) =>
                run(() =>
                  placeStorageLocation({
                    id: Number(id),
                    floorMapId: activeMap.id,
                    mapX: x,
                    mapY: y,
                  }),
                )
              }
              overlays={overlays}
              pins={placed.map((l) => ({
                id: String(l.id),
                x: l.mapX ?? 50,
                y: l.mapY ?? 50,
                label: `${l.nameJa}（${l.code}）｜棚 ${l.shelfCount} 件`,
                icon: (
                  <IconBuildingWarehouse
                    color="var(--mantine-color-violet-6)"
                    fill="var(--mantine-color-violet-1)"
                    size={26}
                    stroke={1.8}
                  />
                ),
              }))}
            />
          )}

          {activeMap && (
            <Group gap="xs" wrap="wrap">
              {placed.map((l) => (
                <Paper key={l.id} px="xs" py={2} radius="sm" withBorder>
                  <Group gap={6} wrap="nowrap">
                    <Text size="xs">{l.nameJa}</Text>
                    <GhostButton
                      onClick={() => run(() => unplaceStorageLocation(l.id))}
                      px={4}
                      size="compact-xs"
                    >
                      <IconX size={12} />
                    </GhostButton>
                  </Group>
                </Paper>
              ))}
              {unplaced.map((l) => (
                <GhostButton
                  key={l.id}
                  leftSection={<IconMapPin size={12} />}
                  onClick={() =>
                    run(() =>
                      placeStorageLocation({
                        id: l.id,
                        floorMapId: activeMap.id,
                        mapX: 50,
                        mapY: 50,
                      }),
                    )
                  }
                  size="compact-xs"
                >
                  {l.nameJa} を配置
                </GhostButton>
              ))}
            </Group>
          )}
        </Stack>
      )}
    </Paper>
  );
}
