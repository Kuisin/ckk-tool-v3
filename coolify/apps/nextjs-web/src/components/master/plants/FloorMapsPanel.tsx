"use client";

/**
 * FloorMapsPanel — 拠点フロアマップ管理（端末管理 SY09 と共用の図面）。
 *
 * フロアの追加・名称変更・図面アップロード・削除と、「重ね表示」（他フロアの
 * 図面を低不透明度で重ねた位置合わせ）を提供する。フロア（図面）管理は
 * 拠点マスタ (MS0C) の「フロアマップ」タブ専用 — 保管場所アプリ (MS0E) は
 * 図面を変更せず、閲覧＋ピン配置のみの StorageLocationMapPanel を使う。
 */

import {
  Chip,
  Group,
  Modal,
  Paper,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconEdit,
  IconMap2,
  IconPhotoUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import {
  createFloorMap,
  deleteFloorMap,
  renameFloorMap,
} from "@/app/(dashboard)/settings/kiosk-devices/actions";
import { AppTabs } from "@/components/ui/AppTabs";
import {
  CancelButton,
  GhostButton,
  PrimaryButton,
} from "@/components/ui/buttons";
import { FloorMapCanvas } from "@/components/ui/FloorMapCanvas";
import { openConfirm } from "@/components/ui/modals";
import { uploadFloorMapImage } from "@/lib/floor-map-client";

/** 拠点のフロアマップ（端末管理 SY09 と共用の図面）。 */
export interface PlantFloorMapRef {
  id: string;
  name: string;
  hasImage: boolean;
}

export function FloorMapsPanel({
  plantId,
  floorMaps,
}: {
  plantId: number;
  floorMaps: PlantFloorMapRef[];
}) {
  const tr = useTranslations();
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
          title: tr("common.error2"),
          message: res.error ?? tr("common.theActionFailed"),
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
            title: tr("common.error2"),
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
            title: tr("common.error2"),
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
    // 図面は最大 10MB。Server Action ではなく API 経由（lib/floor-map-client.ts）。
    run(() => uploadFloorMapImage(activeMap.id, file));
  };

  const onDeleteFloor = () => {
    if (!activeMap) return;
    openConfirm({
      title: tr("common.confirmDeletingTheFloor"),
      message: tr("master.floorMapsPanel.deleteFloorConfirm", {
        name: activeMap.name,
      }),
      confirmLabel: tr("common.delete"),
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
            {tr("common.floorMap")}
          </Text>
          <Text c="dimmed" size="xs">
            {tr("master.plants.siteDrawingsSharedWithDevicesSy09")}
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
            {tr("common.addAFloor")}
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
                {tr("common.rename")}
              </GhostButton>
              <GhostButton
                leftSection={<IconPhotoUp size={14} />}
                loading={pending}
                onClick={() => fileInputRef.current?.click()}
                size="xs"
              >
                {activeMap.hasImage
                  ? tr("common.replaceTheDrawing")
                  : tr("common.uploadADrawing")}
              </GhostButton>
              <GhostButton
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={onDeleteFloor}
                size="xs"
              >
                {tr("common.deleteTheFloor")}
              </GhostButton>
              <input
                accept="image/png,image/jpeg,image/webp"
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
          {tr("master.plants.thereAreNoFloorMapsCreate")}
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
                {tr("common.overlay")}
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
              imageAlt={tr("master.floorMapsPanel.floorMapAlt", {
                name: activeMap.name,
              })}
              imageUrl={
                activeMap.hasImage
                  ? `/api/kiosk/floor-maps/${activeMap.id}/image`
                  : null
              }
              overlays={overlays}
              pins={[]}
            />
          )}
        </Stack>
      )}

      <Modal
        onClose={() => setFloorModal(null)}
        opened={floorModal != null}
        size="sm"
        title={
          floorModal?.mode === "create"
            ? tr("master.floorMapsPanel.addFloor")
            : tr("common.renameTheFloor")
        }
      >
        <Stack gap="sm">
          <TextInput
            label={tr("common.floorName")}
            onChange={(e) => setFloorName(e.currentTarget.value)}
            placeholder={tr("master.plants.eG1fMachiningArea")}
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
              {floorModal?.mode === "create"
                ? tr("common.add")
                : tr("common.save2")}
            </PrimaryButton>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
