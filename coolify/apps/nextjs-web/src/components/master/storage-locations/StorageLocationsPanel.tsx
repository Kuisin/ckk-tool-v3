"use client";

/**
 * StorageLocationsPanel — 保管場所アプリ (MS0E) の拠点別管理パネル。
 *
 * 選択中拠点の保管場所（拠点内の倉庫・置場）と棚をこの場で CRUD し、
 * フロアマップへのピン配置（StorageLocationMapPanel — 閲覧＋ピンのみ。
 * フロア自体の管理は拠点マスタ MS0C）も行う。
 * 在庫が参照する場所・棚はサーバー側で削除拒否（無効化を案内）。
 */

import {
  Badge,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconBuildingWarehouse,
  IconEdit,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createStorageShelf,
  deleteStorageLocation,
  deleteStorageShelf,
  type StorageShelfInput,
  updateStorageShelf,
} from "@/app/(dashboard)/master/storage-locations/actions";
import type { PlantFloorMapRef } from "@/components/master/plants/FloorMapsPanel";
import {
  CancelButton,
  GhostButton,
  PrimaryButton,
  SaveButton,
} from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { openConfirm } from "@/components/ui/modals";
import { LocalizedTextInput } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { type FloorMapOption, LocationModal } from "./LocationModal";
import { StorageLocationMapPanel } from "./StorageLocationMapPanel";

export interface StorageShelfRow {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  nameTranslations: Record<string, string>;
  sortOrder: number;
  isActive: boolean;
}

export interface StorageLocationRow {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  nameTranslations: Record<string, string>;
  sortOrder: number;
  isActive: boolean;
  notes: string;
  /** フロアマップ上のピン（%座標。null = 未配置）。 */
  floorMapId: string | null;
  mapX: number | null;
  mapY: number | null;
  shelves: StorageShelfRow[];
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
  plantOptions,
  allFloorMaps,
}: {
  plantId: number;
  locations: StorageLocationRow[];
  floorMaps: PlantFloorMapRef[];
  /** 有効な拠点（新規作成モーダルの拠点 Select 用）。 */
  plantOptions: { value: string; label: string }[];
  /** 全拠点の有効なフロアマップ（新規作成モーダルのフロア Select 用）。 */
  allFloorMaps: FloorMapOption[];
}) {
  const tr = useTr();
  const router = useRouter();
  const [locationModal, setLocationModal] = useState<LocationModalState>(null);
  const [shelfModal, setShelfModal] = useState<ShelfModalState>(null);
  const [pending, startTransition] = useTransition();

  function onDeleteLocation(loc: StorageLocationRow) {
    openConfirm({
      title: tr("保管場所の削除"),
      message: `「${loc.nameJa}」（棚 ${loc.shelves.length} 件を含む）を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () => {
        startTransition(async () => {
          const res = await deleteStorageLocation(loc.id);
          if (!res.ok) {
            notifications.show({
              title: tr("削除失敗"),
              message: tr(res.error),
              color: "red",
            });
            return;
          }
          notifications.show({
            title: tr("削除しました"),
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
      title: tr("棚の削除"),
      message: `棚「${shelf.code}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () => {
        startTransition(async () => {
          const res = await deleteStorageShelf(shelf.id);
          if (!res.ok) {
            notifications.show({
              title: tr("削除失敗"),
              message: tr(res.error),
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
          {tr(
            tr(
              "拠点内の倉庫・置場と棚。在庫はこの単位で保管され、在庫管理（PD04）\n          の在庫移動で場所間を動かせます。",
            ),
          )}
        </Text>
        <PrimaryButton
          leftSection={<IconPlus size={14} />}
          onClick={() => setLocationModal({ location: null })}
          size="xs"
        >
          {tr("保管場所を追加")}
        </PrimaryButton>
      </Group>

      <StorageLocationMapPanel
        floorMaps={floorMaps}
        pins={locations.map((l) => ({
          id: l.id,
          code: l.code,
          nameJa: l.nameJa,
          isActive: l.isActive,
          floorMapId: l.floorMapId,
          mapX: l.mapX,
          mapY: l.mapY,
          shelfCount: l.shelves.length,
        }))}
      />

      {locations.length === 0 ? (
        <EmptyState
          icon={<IconBuildingWarehouse size={22} />}
          message={tr("保管場所はまだ登録されていません")}
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
                        {tr("無効")}
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
                  {tr("棚を追加")}
                </GhostButton>
                <GhostButton
                  leftSection={<IconEdit size={14} />}
                  onClick={() => setLocationModal({ location: loc })}
                  size="xs"
                >
                  {tr("編集")}
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
                          {tr("無効")}
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
          defaultPlantId={plantId}
          floorMaps={allFloorMaps}
          location={locationModal.location}
          onClose={() => setLocationModal(null)}
          onDone={() => {
            setLocationModal(null);
            router.refresh();
          }}
          plantOptions={plantOptions}
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
  const tr = useTr();
  const [pending, startTransition] = useTransition();
  const form = useForm<StorageShelfInput>({
    initialValues: {
      code: shelf?.code ?? "",
      nameJa: shelf?.nameJa ?? "",
      nameTranslations: shelf?.nameTranslations ?? {},
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
          title: tr("保存失敗"),
          message: tr(res.error),
          color: "red",
        });
        return;
      }
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} opened title={shelf ? "棚の編集" : tr("棚の追加")}>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("storageLocation", "code", {
                  label: tr("棚コード"),
                })}
              />
            }
            placeholder="A-1"
            withAsterisk
            {...form.getInputProps("code")}
          />
          <LocalizedTextInput
            help={fieldHelpTip("storageLocation", "code")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("名称（任意）")}
            translationsProps={form.getInputProps("nameTranslations")}
          />
          <NumberInput
            label={<HelpLabel {...fieldHelp("storageLocation", "sortOrder")} />}
            {...form.getInputProps("sortOrder")}
          />
          <Switch
            checked={form.values.isActive}
            label={
              <HelpLabel
                {...fieldHelp("storageLocation", "active", { label: "有効" })}
              />
            }
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
