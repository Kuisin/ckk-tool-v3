"use client";

/**
 * StorageLocationsPanel — MS0B 工場詳細「保管場所」タブ。
 *
 * 保管場所（工場内の倉庫・置場）と棚をこの場で CRUD する。
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
  Textarea,
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
  createStorageLocation,
  createStorageShelf,
  deleteStorageLocation,
  deleteStorageShelf,
  type StorageLocationInput,
  type StorageShelfInput,
  updateStorageLocation,
  updateStorageShelf,
} from "@/app/(dashboard)/master/factories/storage-actions";
import {
  GhostButton,
  PrimaryButton,
  SaveButton,
  CancelButton,
} from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
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
  shelves: StorageShelfRow[];
}

/** モーダルの編集対象（null = 新規）。 */
type LocationModalState = { location: StorageLocationRow | null } | null;
type ShelfModalState = {
  locationId: number;
  shelf: StorageShelfRow | null;
} | null;

export function StorageLocationsPanel({
  factoryId,
  locations,
}: {
  factoryId: number;
  locations: StorageLocationRow[];
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
          工場内の倉庫・置場と棚。在庫はこの単位で保管され、在庫管理（PD04）
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
          factoryId={factoryId}
          location={locationModal.location}
          onClose={() => setLocationModal(null)}
          onDone={() => {
            setLocationModal(null);
            router.refresh();
          }}
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

function LocationModal({
  factoryId,
  location,
  onClose,
  onDone,
}: {
  factoryId: number;
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
        : await createStorageLocation(factoryId, values);
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
          <NumberInput
            label="表示順"
            {...form.getInputProps("sortOrder")}
          />
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
