"use client";

/**
 * KioskFloorMapView — フロアマップ（SY09, /settings/kiosk-devices/map）。
 *
 * 拠点 → フロア（タブ）→ マップ上に端末ピン（mapX/mapY %座標）を表示する。
 * ピンの色はオンライン状態（useKioskPresence ライブ / initialOnline フォールバック）。
 *
 * 閲覧モード:
 *   - 右パネルに拠点の端末一覧（このフロア / その他）を表示
 *   - ピンをクリックで選択 → 一覧の該当行をハイライト（スクロールも追従）、
 *     一覧の行クリックでもピンをハイライト
 *   - ピンをダブルクリック / 行の「>」で端末詳細ページへ移動
 *
 * 編集モード:
 *   - ピンをポインタードラッグで移動（drop で placeDevice に %座標を保存）
 *   - サイドバーの未配置端末をクリックで中央（50%, 50%）に配置
 *   - 配置済み端末の「解除」でピンを外す
 *   - フロアの追加・名称変更・削除、図面画像のアップロード/差し替え
 * 外部ドラッグライブラリ不使用（Pointer Events のみ）。
 */

import {
  ActionIcon,
  Alert,
  Box,
  Divider,
  Flex,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconBuildingWarehouse,
  IconChevronRight,
  IconMapPin,
  IconPencil,
  IconPhotoUp,
  IconPlus,
  IconTrash,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  createFloorMap,
  deleteFloorMap,
  placeDevice,
  renameFloorMap,
  unplaceDevice,
} from "@/app/(dashboard)/settings/kiosk-devices/actions";
import { AppTabs } from "@/components/ui/AppTabs";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { uploadFloorMapImage } from "@/lib/floor-map-client";
import type {
  KioskDeviceRow,
  KioskFloorMapRow,
  KioskPlantOption,
  StorageLocationPin,
} from "@/lib/kiosk-admin";
import type { ActionResult } from "@/lib/server-action";
import {
  OnlineDot,
  resolveCurrentUserName,
  resolveOnline,
} from "./KioskDevicesTable";
import { useKioskPresence } from "./useKioskPresence";

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

const DEVICE_DETAIL_PATH = "/settings/kiosk-devices";

export function KioskFloorMapView({
  devices,
  floorMaps,
  plantOptions,
  storagePins,
}: {
  devices: KioskDeviceRow[];
  floorMaps: KioskFloorMapRow[];
  plantOptions: KioskPlantOption[];
  /** 保管場所ピン（読み取り専用レイヤ — 配置は保管場所マスタ MS0E）。 */
  storagePins: StorageLocationPin[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { presence, live } = useKioskPresence();

  // 拠点選択（既定: フロアマップを持つ最初の拠点 → 無ければ先頭）。
  const defaultPlant =
    plantOptions.find((f) =>
      floorMaps.some((m) => String(m.plantId) === f.value),
    )?.value ??
    plantOptions[0]?.value ??
    null;
  const [plant, setPlant] = useState<string | null>(defaultPlant);
  const [editMode, setEditMode] = useState(false);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);

  const plantMaps = useMemo(
    () => floorMaps.filter((m) => String(m.plantId) === (plant ?? "")),
    [floorMaps, plant],
  );
  const activeMap =
    plantMaps.find((m) => m.id === activeMapId) ?? plantMaps[0] ?? null;

  const plantDevices = useMemo(
    () =>
      devices.filter(
        (d) => d.status === "ACTIVE" && String(d.plantId ?? "") === plant,
      ),
    [devices, plant],
  );
  const placedDevices = activeMap
    ? plantDevices.filter((d) => d.floorMapId === activeMap.id)
    : [];
  const unplacedDevices = plantDevices.filter((d) => d.floorMapId == null);
  /** 右パネルの「その他」= このフロアに配置されていない拠点内端末。 */
  const otherDevices = activeMap
    ? plantDevices.filter((d) => d.floorMapId !== activeMap.id)
    : plantDevices;

  // ── 選択（ピン ⇄ 右パネルのハイライト連動） ─────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const selectDevice = (id: string, opts?: { scrollList?: boolean }) => {
    setSelectedId(id);
    if (opts?.scrollList) {
      // 一覧側の該当行を見える位置へ（レンダー後にスクロール）
      requestAnimationFrame(() => {
        rowRefs.current
          .get(id)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    }
  };

  const clearSelection = () => setSelectedId(null);

  // ドラッグ中のローカル座標（保存完了までの表示上書き）。
  const [localPos, setLocalPos] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const mapAreaRef = useRef<HTMLDivElement | null>(null);

  // フロア管理モーダル
  const [floorModal, setFloorModal] = useState<
    { mode: "create" } | { mode: "rename"; map: KioskFloorMapRow } | null
  >(null);
  const [floorName, setFloorName] = useState("");
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    run: () => Promise<ActionResult>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const run = (action: () => Promise<ActionResult>, successMessage: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: tr("common.completed"),
          message: successMessage,
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  // ── ピンのドラッグ（Pointer Events） ──────────────────────────────────────

  const pctFromEvent = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = mapAreaRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 50, y: 50 };
    return {
      x: clampPct(((e.clientX - rect.left) / rect.width) * 100),
      y: clampPct(((e.clientY - rect.top) / rect.height) * 100),
    };
  };

  const onPinPointerDown = (deviceId: string, e: React.PointerEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { id: deviceId, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPinPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.moved = true;
    const pos = pctFromEvent(e);
    setLocalPos((prev) => ({ ...prev, [drag.id]: pos }));
  };

  const onPinPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !drag.moved || !activeMap) return;
    const pos = pctFromEvent(e);
    const mapId = activeMap.id;
    const deviceId = drag.id;
    startTransition(async () => {
      const result = await placeDevice({
        id: deviceId,
        floorMapId: mapId,
        mapX: pos.x,
        mapY: pos.y,
      });
      if (result.ok) {
        setLocalPos((prev) => {
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const placeAtCenter = (deviceId: string) => {
    if (!activeMap) return;
    run(
      () =>
        placeDevice({
          id: deviceId,
          floorMapId: activeMap.id,
          mapX: 50,
          mapY: 50,
        }),
      tr("settings.kiosk.theDeviceWasPlacedDragTo"),
    );
  };

  // ── フロア管理 ────────────────────────────────────────────────────────────

  const handleFloorSubmit = () => {
    if (!floorName.trim()) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("settings.kiosk.enterAFloorName"),
        color: "red",
      });
      return;
    }
    if (floorModal?.mode === "create") {
      const plantId = Number(plant);
      startTransition(async () => {
        const result = await createFloorMap({ plantId, name: floorName });
        if (result.ok) {
          setFloorModal(null);
          setFloorName("");
          setActiveMapId(result.data.id);
          notifications.show({
            title: tr("common.created"),
            message: tr("settings.kiosk.theFloorWasAdded"),
            color: "green",
          });
        } else {
          notifications.show({
            title: tr("common.error2"),
            message: result.error,
            color: "red",
          });
        }
      });
    } else if (floorModal?.mode === "rename") {
      const id = floorModal.map.id;
      startTransition(async () => {
        const result = await renameFloorMap({ id, name: floorName });
        if (result.ok) {
          setFloorModal(null);
          setFloorName("");
          notifications.show({
            title: tr("common.saved2"),
            message: tr("settings.kiosk.theFloorNameWasChanged"),
            color: "green",
          });
        } else {
          notifications.show({
            title: tr("common.error2"),
            message: result.error,
            color: "red",
          });
        }
      });
    }
  };

  const handleImageSelected = (file: File | null) => {
    if (!file || !activeMap) return;
    // 図面は最大 10MB。Server Action ではなく API 経由（lib/floor-map-client.ts）。
    run(
      () => uploadFloorMapImage(activeMap.id, file),
      tr("settings.kiosk.theDrawingImageWasUpdated"),
    );
  };

  // ── 描画 ──────────────────────────────────────────────────────────────────

  const pinFor = (d: KioskDeviceRow) => {
    const pos = localPos[d.id] ?? { x: d.mapX ?? 50, y: d.mapY ?? 50 };
    const online = resolveOnline(d, presence, live);
    const currentUser = resolveCurrentUserName(d, presence, live);
    const selected = selectedId === d.id;
    return (
      <Tooltip
        events={{ hover: true, focus: true, touch: true }}
        key={d.id}
        label={`${d.name ?? "（未設定）"}${d.location ? ` — ${d.location}` : ""}${
          currentUser ? `｜利用中: ${currentUser}` : ""
        }`}
        withinPortal
      >
        <Box
          onClick={(e) => {
            if (editMode) return;
            e.stopPropagation(); // マップ背景クリック（選択解除）と区別
            selectDevice(d.id, { scrollList: true });
          }}
          onDoubleClick={() => {
            if (!editMode) router.push(`${DEVICE_DETAIL_PATH}/${d.id}`);
          }}
          onPointerDown={(e) => onPinPointerDown(d.id, e)}
          onPointerMove={onPinPointerMove}
          onPointerUp={onPinPointerUp}
          style={{
            position: "absolute",
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: selected
              ? "translate(-50%, -50%) scale(1.25)"
              : "translate(-50%, -50%)",
            cursor: editMode ? "grab" : "pointer",
            touchAction: "none",
            lineHeight: 0,
            zIndex: selected ? 3 : 2,
            // タッチ操作用にヒット領域を広げる（見た目は変えない）
            padding: 8,
          }}
        >
          <IconMapPin
            color={
              selected
                ? "var(--mantine-color-blue-6)"
                : online
                  ? "var(--mantine-color-green-6)"
                  : "var(--mantine-color-gray-5)"
            }
            fill={
              selected
                ? "var(--mantine-color-blue-2)"
                : online
                  ? "var(--mantine-color-green-2)"
                  : "var(--mantine-color-gray-2)"
            }
            size={28}
            stroke={2}
          />
          {/* 利用中（ライブセッションあり）の端末はピン右上に利用者バッジ */}
          {currentUser && (
            <Box
              style={{
                position: "absolute",
                top: -7,
                right: -7,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "var(--mantine-color-blue-6)",
                border: "2px solid var(--mantine-color-body)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconUser color="white" size={10} stroke={3} />
            </Box>
          )}
        </Box>
      </Tooltip>
    );
  };

  /**
   * 右パネルの端末行（閲覧モード）。クリックで選択（配置済みはピンも
   * ハイライト）、「>」で端末詳細ページへ。
   */
  const deviceRow = (d: KioskDeviceRow) => {
    const online = resolveOnline(d, presence, live);
    const currentUser = resolveCurrentUserName(d, presence, live);
    const selected = selectedId === d.id;
    return (
      <Paper
        key={d.id}
        onClick={() => selectDevice(d.id)}
        p="xs"
        ref={(el) => {
          if (el) rowRefs.current.set(d.id, el);
          else rowRefs.current.delete(d.id);
        }}
        style={{
          cursor: "pointer",
          borderColor: selected ? "var(--mantine-color-blue-5)" : undefined,
          backgroundColor: selected
            ? "var(--mantine-color-blue-light)"
            : undefined,
        }}
        withBorder
      >
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Box className="min-w-0" style={{ flex: 1 }}>
            <Group gap={6} wrap="nowrap">
              <OnlineDot online={online} />
              <Text fw={500} size="sm" truncate>
                {d.name ?? tr("common.notSet")}
              </Text>
            </Group>
            {d.location && (
              <Text c="dimmed" size="xs" truncate>
                {d.location}
              </Text>
            )}
            {currentUser && (
              <Text c="blue" size="xs" truncate>
                利用中: {currentUser}
              </Text>
            )}
          </Box>
          <Tooltip label={tr("settings.kiosk.openDeviceDetails")} withinPortal>
            <ActionIcon
              aria-label={tr("settings.kiosk.openDeviceDetails")}
              color="gray"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`${DEVICE_DETAIL_PATH}/${d.id}`);
              }}
              variant="subtle"
            >
              <IconChevronRight size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Paper>
    );
  };

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <SecondaryButton
            href="/settings/kiosk-devices"
            leftSection={<IconArrowLeft size={14} />}
          >
            {tr("settings.kiosk.toTheDeviceList")}
          </SecondaryButton>
        }
        breadcrumbs={[
          tr("common.system"),
          tr("common.devices"),
          tr("common.floorMap"),
        ]}
        title={tr("common.floorMap")}
      />
      <Paper p="sm" shadow="xs">
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap">
            <Select
              allowDeselect={false}
              data={plantOptions}
              label={tr("common.site")}
              onChange={(v) => {
                setPlant(v);
                setActiveMapId(null);
                clearSelection();
              }}
              searchable
              value={plant}
              w={240}
            />
            <Switch
              checked={editMode}
              label={tr("settings.kiosk.editMode")}
              onChange={(e) => {
                setEditMode(e.currentTarget.checked);
                clearSelection();
              }}
            />
          </Group>

          {plantMaps.length === 0 ? (
            <Alert color="gray" variant="light">
              {tr("settings.kioskFloorMapView.thisSiteHasNoFloorMaps")}
              {editMode
                ? tr("settings.kiosk.createOneUnderAddAFloor")
                : tr("settings.kiosk.youCanAddFloorsInEdit")}
            </Alert>
          ) : (
            <AppTabs
              onChange={(v) => {
                setActiveMapId(v);
                clearSelection();
              }}
              value={activeMap?.id ?? null}
            >
              <Tabs.List>
                {plantMaps.map((m) => (
                  <Tabs.Tab key={m.id} value={m.id}>
                    {m.name}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </AppTabs>
          )}

          {editMode && (
            <Group gap="xs" wrap="wrap">
              <SecondaryButton
                disabled={!plant}
                leftSection={<IconPlus size={14} />}
                onClick={() => {
                  setFloorModal({ mode: "create" });
                  setFloorName("");
                }}
              >
                {tr("common.addAFloor")}
              </SecondaryButton>
              {activeMap && (
                <>
                  <SecondaryButton
                    leftSection={<IconPencil size={14} />}
                    onClick={() => {
                      setFloorModal({ mode: "rename", map: activeMap });
                      setFloorName(activeMap.name);
                    }}
                  >
                    {tr("common.rename")}
                  </SecondaryButton>
                  <SecondaryButton
                    leftSection={<IconPhotoUp size={14} />}
                    loading={isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {activeMap.fileId
                      ? tr("common.replaceTheDrawing")
                      : tr("common.uploadADrawing")}
                  </SecondaryButton>
                  <GhostButton
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() =>
                      setConfirm({
                        title: tr("common.confirmDeletingTheFloor"),
                        message: tr(
                          "settings.kioskFloorMapView.deleteFloorNameCannotIfDevices",
                          { name: activeMap.name },
                        ),
                        confirmLabel: tr("common.delete"),
                        run: () => deleteFloorMap(activeMap.id),
                      })
                    }
                  >
                    {tr("common.deleteTheFloor")}
                  </GhostButton>
                  <input
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    hidden
                    onChange={(e) => {
                      handleImageSelected(e.currentTarget.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                    ref={fileInputRef}
                    type="file"
                  />
                </>
              )}
            </Group>
          )}

          {activeMap && (
            // モバイルは縦積み（マップ幅を確保）、md 以上で横並び + 固定幅サイドバー
            <Flex
              align="flex-start"
              direction={{ base: "column", md: "row" }}
              gap="md"
            >
              {/* マップ領域（背景クリックで選択解除 — ピン側は stopPropagation） */}
              <Box
                onClick={() => {
                  if (!editMode) clearSelection();
                }}
                ref={mapAreaRef}
                style={{
                  position: "relative",
                  flex: 1,
                  minWidth: 0,
                  width: "100%",
                  border: "1px solid var(--mantine-color-default-border)",
                  borderRadius: "var(--mantine-radius-md)",
                  overflow: "hidden",
                  userSelect: "none",
                }}
              >
                {activeMap.fileId ? (
                  // biome-ignore lint/performance/noImgElement: SeaweedFS プロキシ配信の等倍図面（next/image 最適化対象外）
                  <img
                    alt={tr("settings.kioskFloorMapView.floorMapName", {
                      name: activeMap.name,
                    })}
                    draggable={false}
                    src={`/api/kiosk/floor-maps/${activeMap.id}/image`}
                    style={{ width: "100%", display: "block" }}
                  />
                ) : (
                  // 図面なし: 方眼グリッドのプレースホルダ
                  <Box
                    style={{
                      aspectRatio: "4 / 3",
                      backgroundColor: "var(--mantine-color-body)",
                      backgroundImage:
                        "linear-gradient(var(--mantine-color-default-border) 1px, transparent 1px)," +
                        "linear-gradient(90deg, var(--mantine-color-default-border) 1px, transparent 1px)",
                      backgroundSize: "40px 40px",
                    }}
                  />
                )}
                {/* 保管場所レイヤ（読み取り専用 — 配置は保管場所マスタ MS0E） */}
                {activeMap &&
                  storagePins
                    .filter((p) => p.floorMapId === activeMap.id)
                    .map((p) => (
                      <Tooltip
                        events={{ hover: true, focus: true, touch: true }}
                        key={`storage-${p.id}`}
                        label={tr(
                          "settings.kioskFloorMapView.storageLocationNameCodeShelfCount",
                          { name: p.name, code: p.code, count: p.shelfCount },
                        )}
                        withinPortal
                      >
                        <Box
                          style={{
                            position: "absolute",
                            left: `${p.mapX}%`,
                            top: `${p.mapY}%`,
                            transform: "translate(-50%, -50%)",
                            lineHeight: 0,
                            zIndex: 1,
                            padding: 6,
                          }}
                        >
                          <IconBuildingWarehouse
                            color="var(--mantine-color-violet-6)"
                            fill="var(--mantine-color-violet-1)"
                            size={24}
                            stroke={1.8}
                          />
                        </Box>
                      </Tooltip>
                    ))}
                {placedDevices.map(pinFor)}
              </Box>

              {/* 閲覧モード: 端末一覧パネル（ピン選択とハイライト連動） */}
              {!editMode && (
                <Stack gap="xs" w={{ base: "100%", md: 280 }}>
                  <Group justify="space-between">
                    <Text fw={600} size="sm">
                      {tr("settings.kiosk.devices")}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {plantDevices.length} 台
                    </Text>
                  </Group>
                  <ScrollArea.Autosize mah={560} offsetScrollbars type="auto">
                    <Stack gap="xs">
                      <Text c="dimmed" fw={600} size="xs">
                        このフロア（{placedDevices.length}）
                      </Text>
                      {placedDevices.length === 0 ? (
                        <Text c="dimmed" size="xs">
                          {tr("settings.kiosk.noDevicesArePlacedOnThis")}
                        </Text>
                      ) : (
                        placedDevices.map(deviceRow)
                      )}
                      {otherDevices.length > 0 && (
                        <>
                          <Divider />
                          <Text c="dimmed" fw={600} size="xs">
                            その他の端末（{otherDevices.length}）
                          </Text>
                          {otherDevices.map(deviceRow)}
                        </>
                      )}
                    </Stack>
                  </ScrollArea.Autosize>
                </Stack>
              )}

              {/* 編集モード: サイドバー（モバイルはマップ下に全幅） */}
              {editMode && (
                <Stack gap="xs" w={{ base: "100%", md: 260 }}>
                  <Text fw={600} size="sm">
                    {tr("settings.kiosk.devicesNotPlaced")}
                  </Text>
                  {unplacedDevices.length === 0 ? (
                    <Text c="dimmed" size="xs">
                      {tr("settings.kiosk.everyDeviceAtThisSiteIs")}
                    </Text>
                  ) : (
                    unplacedDevices.map((d) => (
                      <Paper
                        key={d.id}
                        onClick={() => placeAtCenter(d.id)}
                        p="xs"
                        style={{ cursor: "pointer" }}
                        withBorder
                      >
                        <Group gap="xs" wrap="nowrap">
                          <IconMapPin size={16} />
                          <Box className="min-w-0">
                            <Text fw={500} size="sm" truncate>
                              {d.name ?? tr("common.notSet")}
                            </Text>
                            {d.location && (
                              <Text c="dimmed" size="xs" truncate>
                                {d.location}
                              </Text>
                            )}
                          </Box>
                        </Group>
                      </Paper>
                    ))
                  )}
                  <Divider />
                  <Text fw={600} size="sm">
                    {tr("settings.kiosk.placed")}
                  </Text>
                  {placedDevices.length === 0 ? (
                    <Text c="dimmed" size="xs">
                      {tr("settings.kiosk.noDevicesArePlacedOnThis")}
                    </Text>
                  ) : (
                    placedDevices.map((d) => (
                      <Group
                        gap="xs"
                        justify="space-between"
                        key={d.id}
                        wrap="nowrap"
                      >
                        <Text size="sm" truncate>
                          {d.name ?? tr("common.notSet")}
                        </Text>
                        <Tooltip
                          label={tr("settings.kiosk.removeThePin")}
                          withinPortal
                        >
                          <ActionIcon
                            aria-label={tr("settings.kiosk.removeThePin")}
                            color="gray"
                            onClick={() =>
                              run(
                                () => unplaceDevice(d.id),
                                tr("settings.kiosk.thePinWasRemoved"),
                              )
                            }
                            variant="subtle"
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    ))
                  )}
                </Stack>
              )}
            </Flex>
          )}
        </Stack>
      </Paper>

      {/* フロア追加・名称変更モーダル */}
      <ModalShell
        confirmLabel={
          floorModal?.mode === "create" ? tr("common.add") : tr("common.save2")
        }
        loading={isPending}
        onClose={() => setFloorModal(null)}
        onConfirm={handleFloorSubmit}
        opened={floorModal != null}
        size="sm"
        title={
          floorModal?.mode === "create"
            ? tr("settings.kioskFloorMapView.addAFloor")
            : tr("common.renameTheFloor")
        }
      >
        <TextInput
          label={tr("common.floorName")}
          onChange={(e) => setFloorName(e.currentTarget.value)}
          placeholder={tr("settings.kiosk.eG1fSite")}
          value={floorName}
          withAsterisk
        />
      </ModalShell>

      {/* 破壊的操作の確認 */}
      <ConfirmModal
        confirmLabel={confirm?.confirmLabel ?? tr("common.run2")}
        loading={isPending}
        message={confirm?.message ?? ""}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) run(confirm.run, tr("common.done"));
        }}
        opened={confirm != null}
        title={confirm?.title ?? ""}
      />
    </Stack>
  );
}
