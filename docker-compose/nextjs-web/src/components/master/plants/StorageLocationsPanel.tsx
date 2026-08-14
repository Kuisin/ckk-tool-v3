"use client";

/**
 * StorageLocationsPanel — MS0B 拠点詳細「保管場所」タブ。
 *
 * 保管場所（拠点内の倉庫・置場）と棚をこの場で CRUD する。
 * 在庫が参照する場所・棚はサーバー側で削除拒否（無効化を案内）。
 */

import {
  Badge,
  Chip,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconBuildingWarehouse,
  IconEdit,
  IconMap2,
  IconMapPin,
  IconPhotoUp,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  createStorageLocation,
  createStorageShelf,
  deleteStorageLocation,
  deleteStorageShelf,
  placeStorageLocation,
  type StorageLocationInput,
  type StorageShelfInput,
  unplaceStorageLocation,
  updateStorageLocation,
  updateStorageShelf,
} from "@/app/(dashboard)/master/plants/storage-actions";
import {
  createFloorMap,
  deleteFloorMap,
  renameFloorMap,
  uploadFloorMapImage,
} from "@/app/(dashboard)/settings/kiosk-devices/actions";
import {
  CancelButton,
  GhostButton,
  PrimaryButton,
  SaveButton,
} from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloorMapCanvas } from "@/components/ui/FloorMapCanvas";
import { openConfirm } from "@/components/ui/modals";

export interface StorageShelfRow {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
}

export interface StorageLocationRow {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  notes: string;
  /** フロアマップ上のピン（%座標。null = 未配置）。 */
  floorMapId: string | null;
  mapX: number | null;
  mapY: number | null;
  shelves: StorageShelfRow[];
}

/** 拠点のフロアマップ（端末管理 SY09 と共用の図面）。 */
export interface PlantFloorMapRef {
  id: string;
  name: string;
  hasImage: boolean;
}

/** モーダルの編集対象（null = 新規）。 */
type LocationModalState = { location: StorageLocationRow | null } | null;
type ShelfModalState = {
  locationId: number;
  shelf: StorageShelfRow | null;
} | null;

export function StorageLocationsPanel({
  plantId,
  locations,
  floorMaps,
}: {
  plantId: number;
  locations: StorageLocationRow[];
  floorMaps: PlantFloorMapRef[];
}) {
  const router = useRouter();
  const [locationModal, setLocationModal] = useState<LocationModalState>(null);
  const [shelfModal, setShelfModal] = useState<ShelfModalState>(null);
  const [pending, startTransition] = useTransition();

  function onDeleteLocation(loc: StorageLocationRow) {
    openConfirm({
      title: "保管場所の削除",
      message: `「${loc.nameJa}」（棚 ${loc.shelves.length} 件を含む）を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () => {
        startTransition(async () => {
          const res = await deleteStorageLocation(loc.id);
          if (!res.ok) {
            notifications.show({
              title: "削除失敗",
              message: res.error,
              color: "red",
            });
            return;
          }
          notifications.show({
            title: "削除しました",
            message: loc.nameJa,
            color: "green",
          });
          router.refresh();
        });
      },
    });
  }

  function onDeleteShelf(shelf: StorageShelfRow) {
    openConfirm({
      title: "棚の削除",
      message: `棚「${shelf.code}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () => {
        startTransition(async () => {
          const res = await deleteStorageShelf(shelf.id);
          if (!res.ok) {
            notifications.show({
              title: "削除失敗",
              message: res.error,
              color: "red",
            });
            return;
          }
          router.refresh();
        });
      },
    });
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          拠点内の倉庫・置場と棚。在庫はこの単位で保管され、在庫管理（PD04）
          の在庫移動で場所間を動かせます。
        </Text>
        <PrimaryButton
          leftSection={<IconPlus size={14} />}
          onClick={() => setLocationModal({ location: null })}
          size="xs"
        >
          保管場所を追加
        </PrimaryButton>
      </Group>

      <StorageMapSection
        floorMaps={floorMaps}
        locations={locations}
        plantId={plantId}
      />

      {locations.length === 0 ? (
        <EmptyState
          icon={<IconBuildingWarehouse size={22} />}
          message="保管場所はまだ登録されていません"
        />
      ) : (
        locations.map((loc) => (
          <Paper key={loc.id} p="md" radius="md" withBorder>
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <IconBuildingWarehouse
                  color="var(--mantine-color-gray-6)"
                  size={18}
                />
                <div>
                  <Group gap="xs">
                    <Text fw={600} size="sm">
                      {loc.nameJa}
                    </Text>
                    <Text c="dimmed" ff="mono" size="xs">
                      {loc.code}
                    </Text>
                    {!loc.isActive && (
                      <Badge color="gray" size="xs" variant="light">
                        無効
                      </Badge>
                    )}
                  </Group>
                  {loc.notes && (
                    <Text c="dimmed" size="xs">
                      {loc.notes}
                    </Text>
                  )}
                </div>
              </Group>
              <Group gap={4} wrap="nowrap">
                <GhostButton
                  leftSection={<IconPlus size={14} />}
                  onClick={() =>
                    setShelfModal({ locationId: loc.id, shelf: null })
                  }
                  size="xs"
                >
                  棚を追加
                </GhostButton>
                <GhostButton
                  leftSection={<IconEdit size={14} />}
                  onClick={() => setLocationModal({ location: loc })}
                  size="xs"
                >
                  編集
                </GhostButton>
                <GhostButton
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  loading={pending}
                  onClick={() => onDeleteLocation(loc)}
                  size="xs"
                >
                  削除
                </GhostButton>
              </Group>
            </Group>

            {loc.shelves.length > 0 && (
              <Group gap="xs" mt="sm" wrap="wrap">
                {loc.shelves.map((shelf) => (
                  <Paper key={shelf.id} px="sm" py={4} radius="sm" withBorder>
                    <Group gap={6} wrap="nowrap">
                      <Text ff="mono" size="xs">
                        {shelf.code}
                      </Text>
                      {shelf.nameJa && (
                        <Text c="dimmed" size="xs">
                          {shelf.nameJa}
                        </Text>
                      )}
                      {!shelf.isActive && (
                        <Badge color="gray" size="xs" variant="light">
                          無効
                        </Badge>
                      )}
                      <GhostButton
                        onClick={() =>
                          setShelfModal({ locationId: loc.id, shelf })
                        }
                        px={4}
                        size="compact-xs"
                      >
                        <IconEdit size={12} />
                      </GhostButton>
                      <GhostButton
                        color="red"
                        onClick={() => onDeleteShelf(shelf)}
                        px={4}
                        size="compact-xs"
                      >
                        <IconTrash size={12} />
                      </GhostButton>
                    </Group>
                  </Paper>
                ))}
              </Group>
            )}
          </Paper>
        ))
      )}

      {locationModal && (
        <LocationModal
          location={locationModal.location}
          onClose={() => setLocationModal(null)}
          onDone={() => {
            setLocationModal(null);
            router.refresh();
          }}
          plantId={plantId}
        />
      )}
      {shelfModal && (
        <ShelfModal
          locationId={shelfModal.locationId}
          onClose={() => setShelfModal(null)}
          onDone={() => {
            setShelfModal(null);
            router.refresh();
          }}
          shelf={shelfModal.shelf}
        />
      )}
    </Stack>
  );
}

/**
 * フロアマップ管理 + 保管場所配置 — フロアマップは端末管理 (SY09) と共用の
 * 拠点図面。ここ（拠点マスタ）でフロアの追加・名称変更・図面アップロード・
 * 削除も行い、保管場所ピンをドラッグ配置する。
 * 「重ね表示」で他フロアの図面を低不透明度で重ね、図面同士の位置合わせが
 * できる（複数フロアのスタッキング）。
 */
function StorageMapSection({
  plantId,
  floorMaps,
  locations,
}: {
  plantId: number;
  floorMaps: PlantFloorMapRef[];
  locations: StorageLocationRow[];
}) {
  const router = useRouter();
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [overlayIds, setOverlayIds] = useState<string[]>([]);
  const [floorModal, setFloorModal] = useState<
    { mode: "create" } | { mode: "rename"; map: PlantFloorMapRef } | null
  >(null);
  const [floorName, setFloorName] = useState("");
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeMap =
    floorMaps.find((m) => m.id === activeMapId) ?? floorMaps[0] ?? null;

  const placed = activeMap
    ? locations.filter((l) => l.floorMapId === activeMap.id)
    : [];
  const unplaced = locations.filter((l) => l.floorMapId == null && l.isActive);
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
          title: "エラー",
          message: res.error ?? "操作に失敗しました",
          color: "red",
        });
        return;
      }
      router.refresh();
    });
  };

  const submitFloorModal = () => {
    if (!floorName.trim()) return;
    if (floorModal?.mode === "create") {
      startTransition(async () => {
        const res = await createFloorMap({ plantId, name: floorName });
        if (!res.ok) {
          notifications.show({
            title: "エラー",
            message: res.error,
            color: "red",
          });
          return;
        }
        setFloorModal(null);
        setFloorName("");
        setActiveMapId(res.data.id);
        router.refresh();
      });
    } else if (floorModal?.mode === "rename") {
      const id = floorModal.map.id;
      startTransition(async () => {
        const res = await renameFloorMap({ id, name: floorName });
        if (!res.ok) {
          notifications.show({
            title: "エラー",
            message: res.error,
            color: "red",
          });
          return;
        }
        setFloorModal(null);
        setFloorName("");
        router.refresh();
      });
    }
  };

  const onImageSelected = (file: File | null) => {
    if (!file || !activeMap) return;
    const formData = new FormData();
    formData.append("file", file);
    run(() => uploadFloorMapImage(activeMap.id, formData));
  };

  const onDeleteFloor = () => {
    if (!activeMap) return;
    openConfirm({
      title: "フロア削除の確認",
      message: `フロア「${activeMap.name}」を削除します。端末・保管場所のピンが残っている場合は削除できません。`,
      confirmLabel: "削除",
      onConfirm: () => {
        setActiveMapId(null);
        run(() => deleteFloorMap(activeMap.id));
      },
    });
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Group gap="xs">
          <IconMap2 color="var(--mantine-color-gray-6)" size={18} />
          <Text fw={600} size="sm">
            フロアマップ
          </Text>
          <Text c="dimmed" size="xs">
            端末管理 (SY09) と共用の図面。保管場所ピンをドラッグで配置
          </Text>
        </Group>
        <Group gap="xs" wrap="wrap">
          <GhostButton
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              setFloorModal({ mode: "create" });
              setFloorName("");
            }}
            size="xs"
          >
            フロアを追加
          </GhostButton>
          {activeMap && (
            <>
              <GhostButton
                leftSection={<IconEdit size={14} />}
                onClick={() => {
                  setFloorModal({ mode: "rename", map: activeMap });
                  setFloorName(activeMap.name);
                }}
                size="xs"
              >
                名称変更
              </GhostButton>
              <GhostButton
                leftSection={<IconPhotoUp size={14} />}
                loading={pending}
                onClick={() => fileInputRef.current?.click()}
                size="xs"
              >
                {activeMap.hasImage ? "図面を差し替え" : "図面をアップロード"}
              </GhostButton>
              <GhostButton
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={onDeleteFloor}
                size="xs"
              >
                フロアを削除
              </GhostButton>
              <input
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={(e) => {
                  onImageSelected(e.currentTarget.files?.[0] ?? null);
                  e.currentTarget.value = "";
                }}
                ref={fileInputRef}
                type="file"
              />
            </>
          )}
        </Group>
      </Group>

      {floorMaps.length === 0 ? (
        <Text c="dimmed" size="sm">
          フロアマップがありません。「フロアを追加」から作成し、図面画像を
          アップロードしてください。
        </Text>
      ) : (
        <Stack gap="sm">
          {floorMaps.length > 1 && (
            <Tabs
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
            </Tabs>
          )}

          {/* 重ね表示（スタッキング）— 他フロアの図面を低不透明度で重ねて位置合わせ */}
          {overlayCandidates.length > 0 && (
            <Group gap="xs" wrap="wrap">
              <Text c="dimmed" size="xs">
                重ね表示:
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
                label: `${l.nameJa}（${l.code}）｜棚 ${l.shelves.length} 件`,
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

      <Modal
        onClose={() => setFloorModal(null)}
        opened={floorModal != null}
        size="sm"
        title={
          floorModal?.mode === "create" ? "フロアを追加" : "フロア名の変更"
        }
      >
        <Stack gap="sm">
          <TextInput
            label="フロア名"
            onChange={(e) => setFloorName(e.currentTarget.value)}
            placeholder="例: 1F 加拠点"
            value={floorName}
            withAsterisk
          />
          <Group justify="flex-end">
            <CancelButton onClick={() => setFloorModal(null)} />
            <PrimaryButton
              disabled={!floorName.trim()}
              loading={pending}
              onClick={submitFloorModal}
            >
              {floorModal?.mode === "create" ? "追加" : "保存"}
            </PrimaryButton>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

function LocationModal({
  plantId,
  location,
  onClose,
  onDone,
}: {
  plantId: number;
  location: StorageLocationRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<StorageLocationInput>({
    initialValues: {
      code: location?.code ?? "",
      nameJa: location?.nameJa ?? "",
      nameEn: location?.nameEn ?? "",
      sortOrder: location?.sortOrder ?? 0,
      isActive: location?.isActive ?? true,
      notes: location?.notes ?? "",
    },
  });

  function submit(values: StorageLocationInput) {
    startTransition(async () => {
      const res = location
        ? await updateStorageLocation(location.id, values)
        : await createStorageLocation(plantId, values);
      if (!res.ok) {
        notifications.show({
          title: "保存失敗",
          message: res.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: "保存しました",
        message: values.nameJa,
        color: "green",
      });
      onDone();
    });
  }

  return (
    <Modal
      onClose={onClose}
      opened
      title={location ? "保管場所の編集" : "保管場所の追加"}
    >
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          <TextInput
            label="コード"
            placeholder="WH1"
            withAsterisk
            {...form.getInputProps("code")}
          />
          <TextInput
            label="名称（日本語）"
            placeholder="第一倉庫"
            withAsterisk
            {...form.getInputProps("nameJa")}
          />
          <TextInput label="名称（英語）" {...form.getInputProps("nameEn")} />
          <NumberInput label="表示順" {...form.getInputProps("sortOrder")} />
          <Switch
            checked={form.values.isActive}
            label="有効"
            onChange={(e) =>
              form.setFieldValue("isActive", e.currentTarget.checked)
            }
          />
          <Textarea label="備考" {...form.getInputProps("notes")} />
          <Group justify="flex-end" mt="xs">
            <CancelButton onClick={onClose} />
            <SaveButton loading={pending} />
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ShelfModal({
  locationId,
  shelf,
  onClose,
  onDone,
}: {
  locationId: number;
  shelf: StorageShelfRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<StorageShelfInput>({
    initialValues: {
      code: shelf?.code ?? "",
      nameJa: shelf?.nameJa ?? "",
      nameEn: shelf?.nameEn ?? "",
      sortOrder: shelf?.sortOrder ?? 0,
      isActive: shelf?.isActive ?? true,
    },
  });

  function submit(values: StorageShelfInput) {
    startTransition(async () => {
      const res = shelf
        ? await updateStorageShelf(shelf.id, values)
        : await createStorageShelf(locationId, values);
      if (!res.ok) {
        notifications.show({
          title: "保存失敗",
          message: res.error,
          color: "red",
        });
        return;
      }
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} opened title={shelf ? "棚の編集" : "棚の追加"}>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          <TextInput
            label="棚コード"
            placeholder="A-1"
            withAsterisk
            {...form.getInputProps("code")}
          />
          <TextInput
            label="名称（日本語・任意）"
            {...form.getInputProps("nameJa")}
          />
          <TextInput label="名称（英語）" {...form.getInputProps("nameEn")} />
          <NumberInput label="表示順" {...form.getInputProps("sortOrder")} />
          <Switch
            checked={form.values.isActive}
            label="有効"
            onChange={(e) =>
              form.setFieldValue("isActive", e.currentTarget.checked)
            }
          />
          <Group justify="flex-end" mt="xs">
            <CancelButton onClick={onClose} />
            <SaveButton loading={pending} />
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
