"use client";

/**
 * KioskFloorMapView — フロアマップ（SY09, /settings/kiosk-devices/map）。
 *
 * 工場 → フロア（タブ）→ マップ上に端末ピン（mapX/mapY %座標）を表示する。
 * ピンの色はオンライン状態（useKioskPresence ライブ / initialOnline フォールバック）。
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
  Group,
  Paper,
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
  IconMapPin,
  IconPencil,
  IconPhotoUp,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  createFloorMap,
  deleteFloorMap,
  placeDevice,
  renameFloorMap,
  unplaceDevice,
  uploadFloorMapImage,
} from "@/app/(dashboard)/settings/kiosk-devices/actions";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import type {
  KioskDeviceRow,
  KioskFactoryOption,
  KioskFloorMapRow,
} from "@/lib/kiosk-admin";
import type { ActionResult } from "@/lib/server-action";
import { resolveOnline } from "./KioskDevicesTable";
import { useKioskPresence } from "./useKioskPresence";

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export function KioskFloorMapView({
  devices,
  floorMaps,
  factoryOptions,
}: {
  devices: KioskDeviceRow[];
  floorMaps: KioskFloorMapRow[];
  factoryOptions: KioskFactoryOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const { presence, live } = useKioskPresence();

  // 工場選択（既定: フロアマップを持つ最初の工場 → 無ければ先頭）。
  const defaultFactory =
    factoryOptions.find((f) =>
      floorMaps.some((m) => String(m.factoryId) === f.value),
    )?.value ??
    factoryOptions[0]?.value ??
    null;
  const [factory, setFactory] = useState<string | null>(defaultFactory);
  const [editMode, setEditMode] = useState(false);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);

  const factoryMaps = useMemo(
    () => floorMaps.filter((m) => String(m.factoryId) === (factory ?? "")),
    [floorMaps, factory],
  );
  const activeMap =
    factoryMaps.find((m) => m.id === activeMapId) ?? factoryMaps[0] ?? null;

  const factoryDevices = useMemo(
    () =>
      devices.filter(
        (d) => d.status === "ACTIVE" && String(d.factoryId ?? "") === factory,
      ),
    [devices, factory],
  );
  const placedDevices = activeMap
    ? factoryDevices.filter((d) => d.floorMapId === activeMap.id)
    : [];
  const unplacedDevices = factoryDevices.filter((d) => d.floorMapId == null);

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
          title: "完了",
          message: successMessage,
          color: "green",
        });
      } else {
        notifications.show({
          title: "エラー",
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
          title: "エラー",
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
      "端末を配置しました（ドラッグで移動できます）",
    );
  };

  // ── フロア管理 ────────────────────────────────────────────────────────────

  const handleFloorSubmit = () => {
    if (!floorName.trim()) {
      notifications.show({
        title: "エラー",
        message: "フロア名を入力してください",
        color: "red",
      });
      return;
    }
    if (floorModal?.mode === "create") {
      const factoryId = Number(factory);
      startTransition(async () => {
        const result = await createFloorMap({ factoryId, name: floorName });
        if (result.ok) {
          setFloorModal(null);
          setFloorName("");
          setActiveMapId(result.data.id);
          notifications.show({
            title: "作成しました",
            message: "フロアを追加しました",
            color: "green",
          });
        } else {
          notifications.show({
            title: "エラー",
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
            title: "保存しました",
            message: "フロア名を変更しました",
            color: "green",
          });
        } else {
          notifications.show({
            title: "エラー",
            message: result.error,
            color: "red",
          });
        }
      });
    }
  };

  const handleImageSelected = (file: File | null) => {
    if (!file || !activeMap) return;
    const formData = new FormData();
    formData.append("file", file);
    run(
      () => uploadFloorMapImage(activeMap.id, formData),
      "図面画像を更新しました",
    );
  };

  // ── 描画 ──────────────────────────────────────────────────────────────────

  const pinFor = (d: KioskDeviceRow) => {
    const pos = localPos[d.id] ?? { x: d.mapX ?? 50, y: d.mapY ?? 50 };
    const online = resolveOnline(d, presence, live);
    return (
      <Tooltip
        key={d.id}
        label={`${d.name ?? "（未設定）"}${d.location ? ` — ${d.location}` : ""}`}
        withinPortal
      >
        <Box
          onPointerDown={(e) => onPinPointerDown(d.id, e)}
          onPointerMove={onPinPointerMove}
          onPointerUp={onPinPointerUp}
          style={{
            position: "absolute",
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: "translate(-50%, -50%)",
            cursor: editMode ? "grab" : "default",
            touchAction: "none",
            lineHeight: 0,
            zIndex: 2,
          }}
        >
          <IconMapPin
            color={
              online
                ? "var(--mantine-color-green-6)"
                : "var(--mantine-color-gray-5)"
            }
            fill={
              online
                ? "var(--mantine-color-green-2)"
                : "var(--mantine-color-gray-2)"
            }
            size={28}
            stroke={2}
          />
        </Box>
      </Tooltip>
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
            端末一覧へ
          </SecondaryButton>
        }
        breadcrumbs={["システム", "端末管理", "フロアマップ"]}
        title="フロアマップ"
      />
      <Paper p="sm" shadow="xs">
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap">
            <Select
              allowDeselect={false}
              data={factoryOptions}
              label="工場"
              onChange={(v) => {
                setFactory(v);
                setActiveMapId(null);
              }}
              searchable
              value={factory}
              w={240}
            />
            <Switch
              checked={editMode}
              label="編集モード"
              onChange={(e) => setEditMode(e.currentTarget.checked)}
            />
          </Group>

          {factoryMaps.length === 0 ? (
            <Alert color="gray" variant="light">
              この工場にはフロアマップがありません。
              {editMode
                ? "下の「フロアを追加」から作成してください。"
                : "編集モードでフロアを追加できます。"}
            </Alert>
          ) : (
            <Tabs
              onChange={(v) => setActiveMapId(v)}
              value={activeMap?.id ?? null}
            >
              <Tabs.List>
                {factoryMaps.map((m) => (
                  <Tabs.Tab key={m.id} value={m.id}>
                    {m.name}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          )}

          {editMode && (
            <Group gap="xs" wrap="wrap">
              <SecondaryButton
                disabled={!factory}
                leftSection={<IconPlus size={14} />}
                onClick={() => {
                  setFloorModal({ mode: "create" });
                  setFloorName("");
                }}
              >
                フロアを追加
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
                    名称変更
                  </SecondaryButton>
                  <SecondaryButton
                    leftSection={<IconPhotoUp size={14} />}
                    loading={isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {activeMap.fileId ? "図面を差し替え" : "図面をアップロード"}
                  </SecondaryButton>
                  <GhostButton
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() =>
                      setConfirm({
                        title: "フロア削除の確認",
                        message: `フロア「${activeMap.name}」を削除します。端末が配置されている場合は削除できません。`,
                        confirmLabel: "削除",
                        run: () => deleteFloorMap(activeMap.id),
                      })
                    }
                  >
                    フロアを削除
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
            <Group align="flex-start" gap="md" wrap="nowrap">
              {/* マップ領域 */}
              <Box
                ref={mapAreaRef}
                style={{
                  position: "relative",
                  flex: 1,
                  minWidth: 0,
                  border: "1px solid var(--mantine-color-default-border)",
                  borderRadius: "var(--mantine-radius-md)",
                  overflow: "hidden",
                  userSelect: "none",
                }}
              >
                {activeMap.fileId ? (
                  // biome-ignore lint/performance/noImgElement: SeaweedFS プロキシ配信の等倍図面（next/image 最適化対象外）
                  <img
                    alt={`フロアマップ: ${activeMap.name}`}
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
                {placedDevices.map(pinFor)}
              </Box>

              {/* 編集モード: サイドバー */}
              {editMode && (
                <Stack gap="xs" w={260}>
                  <Text fw={600} size="sm">
                    未配置の端末
                  </Text>
                  {unplacedDevices.length === 0 ? (
                    <Text c="dimmed" size="xs">
                      この工場に未配置の端末はありません
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
                              {d.name ?? "（未設定）"}
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
                    配置済み
                  </Text>
                  {placedDevices.length === 0 ? (
                    <Text c="dimmed" size="xs">
                      このフロアに配置済みの端末はありません
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
                          {d.name ?? "（未設定）"}
                        </Text>
                        <Tooltip label="ピンを解除" withinPortal>
                          <ActionIcon
                            aria-label="ピンを解除"
                            color="gray"
                            onClick={() =>
                              run(
                                () => unplaceDevice(d.id),
                                "ピンを解除しました",
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
            </Group>
          )}
        </Stack>
      </Paper>

      {/* フロア追加・名称変更モーダル */}
      <ModalShell
        confirmLabel={floorModal?.mode === "create" ? "追加" : "保存"}
        loading={isPending}
        onClose={() => setFloorModal(null)}
        onConfirm={handleFloorSubmit}
        opened={floorModal != null}
        size="sm"
        title={
          floorModal?.mode === "create" ? "フロアを追加" : "フロア名の変更"
        }
      >
        <TextInput
          label="フロア名"
          onChange={(e) => setFloorName(e.currentTarget.value)}
          placeholder="例: 1F 加工場"
          value={floorName}
          withAsterisk
        />
      </ModalShell>

      {/* 破壊的操作の確認 */}
      <ConfirmModal
        confirmLabel={confirm?.confirmLabel ?? "実行"}
        loading={isPending}
        message={confirm?.message ?? ""}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) run(confirm.run, "操作が完了しました");
        }}
        opened={confirm != null}
        title={confirm?.title ?? ""}
      />
    </Stack>
  );
}
