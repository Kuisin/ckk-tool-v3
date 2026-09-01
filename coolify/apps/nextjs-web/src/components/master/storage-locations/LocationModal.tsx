"use client";

/**
 * LocationModal — 保管場所の新規作成 / 編集モーダル (MS0E)。
 *
 * 新規作成は拠点の事前選択に依存しない（全拠点横断一覧からも作成できる）—
 * モーダル内で 拠点（必須）と フロア（任意 — 選んだ拠点のフロアマップ）を
 * 明示的に選ぶ。フロアを選ぶとマップ中央 (50%, 50%) に仮配置され、あとで
 * フロアマップ配置パネルのドラッグで位置を調整できる。編集では拠点・フロア
 * は変更しない（ピンの移動・解除はマップ側で行う）。
 */

import {
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useTransition } from "react";
import {
  createStorageLocation,
  type StorageLocationInput,
  updateStorageLocation,
} from "@/app/(dashboard)/master/storage-locations/actions";
import { CancelButton, SaveButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { LocalizedTextInput } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import type { StorageLocationRow } from "./StorageLocationsPanel";

/** 全拠点分のフロアマップ（拠点選択に応じて絞り込む）。 */
export interface FloorMapOption {
  id: string;
  plantId: number;
  name: string;
}

interface LocationFormValues extends StorageLocationInput {
  plantId: string | null;
  floorMapId: string | null;
}

export function LocationModal({
  location,
  defaultPlantId,
  plantOptions,
  floorMaps,
  onClose,
  onDone,
}: {
  /** 編集対象（null = 新規作成）。 */
  location: StorageLocationRow | null;
  /** 管理パネルから開いた場合の初期選択拠点。 */
  defaultPlantId?: number;
  /** 有効な拠点のみ。 */
  plantOptions: { value: string; label: string }[];
  /** 全拠点の有効なフロアマップ。 */
  floorMaps: FloorMapOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const tr = useTr();
  const [pending, startTransition] = useTransition();
  const isCreate = location == null;
  const form = useForm<LocationFormValues>({
    initialValues: {
      plantId: defaultPlantId != null ? String(defaultPlantId) : null,
      floorMapId: null,
      code: location?.code ?? "",
      nameJa: location?.nameJa ?? "",
      nameTranslations: location?.nameTranslations ?? {},
      sortOrder: location?.sortOrder ?? 0,
      isActive: location?.isActive ?? true,
      notes: location?.notes ?? "",
    },
    validate: {
      plantId: (v) => (isCreate && !v ? "拠点を選択してください" : null),
    },
  });

  const selectedPlantId = form.values.plantId
    ? Number(form.values.plantId)
    : null;
  const floorOptions = floorMaps
    .filter((m) => m.plantId === selectedPlantId)
    .map((m) => ({ value: m.id, label: m.name }));

  function submit(values: LocationFormValues) {
    const { plantId, floorMapId, ...fields } = values;
    startTransition(async () => {
      const res = location
        ? await updateStorageLocation(location.id, fields)
        : await createStorageLocation({
            ...fields,
            plantId: plantId ? Number(plantId) : 0,
            floorMapId: floorMapId || null,
          });
      if (!res.ok) {
        notifications.show({
          title: tr("保存失敗"),
          message: res.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: tr("保存しました"),
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
      title={isCreate ? "保管場所の追加" : tr("保管場所の編集")}
    >
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          {isCreate && (
            <>
              <Select
                data={plantOptions}
                label={
                  <HelpLabel
                    {...fieldHelp("storageLocation", "plant", {
                      label: "拠点",
                    })}
                  />
                }
                placeholder={tr("拠点を選択")}
                searchable
                withAsterisk
                {...form.getInputProps("plantId")}
                onChange={(v) => {
                  form.setFieldValue("plantId", v);
                  form.setFieldValue("floorMapId", null); // 拠点変更でリセット
                }}
              />
              <Select
                clearable
                data={floorOptions}
                description={
                  selectedPlantId != null && floorOptions.length === 0
                    ? tr(
                        tr(
                          "この拠点にはフロアマップがありません（ピンなしで作成）",
                        ),
                      )
                    : tr(
                        tr(
                          "任意 — 選択するとマップ中央に仮配置（あとでドラッグ調整）",
                        ),
                      )
                }
                disabled={selectedPlantId == null || floorOptions.length === 0}
                label={
                  <HelpLabel
                    {...fieldHelp("storageLocation", "plant", {
                      label: tr("フロア"),
                    })}
                  />
                }
                placeholder={
                  selectedPlantId == null
                    ? tr("先に拠点を選択")
                    : floorOptions.length === 0
                      ? tr("フロアマップなし")
                      : tr("フロアを選択（任意）")
                }
                {...form.getInputProps("floorMapId")}
              />
            </>
          )}
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("storageLocation", "code", { label: "コード" })}
              />
            }
            placeholder="WH1"
            withAsterisk
            {...form.getInputProps("code")}
          />
          <LocalizedTextInput
            help={fieldHelpTip("storageLocation", "code")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("名称")}
            placeholder={tr("第一倉庫")}
            required
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
          <Textarea
            label={
              <HelpLabel
                {...fieldHelp("storageLocation", "active", {
                  label: tr("備考"),
                })}
              />
            }
            {...form.getInputProps("notes")}
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
