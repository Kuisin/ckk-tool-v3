"use client";

/**
 * StockTransferModal — 在庫移動（在庫管理 PD04）。
 *
 * 移動元（在庫行）から 移動先 = 拠点 → 保管場所 → 棚 を選んで数量を移す。
 * 予約分は動かせない（最大 = 利用可能数）。サーバー側 transferStock が
 * OUT/IN の取引ペアで記録する。
 */

import {
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowsExchange } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { transferStock } from "@/app/(dashboard)/production/inventory/actions";
import { CancelButton, PrimaryButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { fieldHelp } from "@/lib/field-help";

/** 移動先の選択肢（拠点 → 保管場所 → 棚。サーバーで有効行のみに整形済み）。 */
export interface TransferPlantOption {
  id: number;
  name: string;
  locations: {
    id: number;
    code: string;
    name: string;
    /** フロアマップ上のピン（ロケーションビュー用。null = 未配置）。 */
    floorMapId: string | null;
    mapX: number | null;
    mapY: number | null;
    shelves: { id: number; code: string; name: string | null }[];
  }[];
  /** 拠点のフロアマップ（端末管理 SY09 と共用。ロケーションビュー用）。 */
  floorMaps: { id: string; name: string; hasImage: boolean }[];
}

/** 移動元在庫の表示・制約情報。 */
export interface TransferSource {
  inventoryType: "PRODUCT" | "MATERIAL";
  inventoryId: string;
  /** 品目ラベル（製品名（コード） / 素材コード（名称））。 */
  label: string;
  /** 追加情報（ロット等、null 可）。 */
  detail: string | null;
  /** 移動可能数（= 利用可能数）。 */
  available: number;
  unit: string;
  /** 製品は整数のみ。 */
  integerOnly: boolean;
  /** 現在の場所ラベル（拠点 / 保管場所 / 棚）。 */
  currentLabel: string;
}

export function StockTransferModal({
  source,
  plants,
  onClose,
  onDone,
}: {
  source: TransferSource;
  plants: TransferPlantOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const tr = useTranslations();
  const [plantId, setPlantId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const plant = plants.find((f) => String(f.id) === plantId) ?? null;
  const location =
    plant?.locations.find((l) => String(l.id) === locationId) ?? null;

  const locationOptions = useMemo(
    () =>
      (plant?.locations ?? []).map((l) => ({
        value: String(l.id),
        label: `${l.name}（${l.code}）`,
      })),
    [plant],
  );
  const shelfOptions = useMemo(
    () =>
      (location?.shelves ?? []).map((s) => ({
        value: String(s.id),
        label: s.name ? `${s.code}（${s.name}）` : s.code,
      })),
    [location],
  );

  const qty = typeof quantity === "number" ? quantity : Number(quantity);
  const valid = plantId != null && qty > 0 && qty <= source.available;

  function submit() {
    if (!valid || !plantId) return;
    startTransition(async () => {
      const res = await transferStock({
        inventoryType: source.inventoryType,
        inventoryId: source.inventoryId,
        quantity: qty,
        targetPlantId: Number(plantId),
        targetStorageLocationId: locationId ? Number(locationId) : null,
        targetShelfId: shelfId ? Number(shelfId) : null,
        notes: notes || undefined,
      });
      if (!res.ok) {
        notifications.show({
          title: tr("production.inventory.couldNotTransferTheStock"),
          message: res.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: tr("production.inventory.theStockWasTransferred"),
        message: `${source.label} × ${qty}${source.unit}`,
        color: "green",
      });
      onDone();
    });
  }

  return (
    <Modal
      onClose={onClose}
      opened
      title={
        <Group gap="xs">
          <IconArrowsExchange size={16} />
          <Text fw={600} size="sm">
            {tr("production.inventory.stockTransfer")}
          </Text>
        </Group>
      }
    >
      <Stack gap="sm">
        <div>
          <Text fw={600} size="sm">
            {source.label}
          </Text>
          {source.detail && (
            <Text c="dimmed" size="xs">
              {source.detail}
            </Text>
          )}
          <Text c="dimmed" size="xs">
            現在地: {source.currentLabel} ／ 移動可能{" "}
            {source.available.toLocaleString("ja-JP")} {source.unit}
          </Text>
        </div>

        <Select
          data={plants.map((f) => ({
            value: String(f.id),
            label: f.name,
          }))}
          label={<HelpLabel {...fieldHelp(tr, "productInventory", "plant")} />}
          onChange={(v) => {
            setPlantId(v);
            setLocationId(null);
            setShelfId(null);
          }}
          placeholder={tr("common.select")}
          searchable
          value={plantId}
          withAsterisk
        />
        <Select
          clearable
          data={locationOptions}
          disabled={!plant}
          label={
            <HelpLabel
              {...fieldHelp(tr, "productInventory", "location", {
                label: tr("common.storageLocations"),
              })}
            />
          }
          onChange={(v) => {
            setLocationId(v);
            setShelfId(null);
          }}
          placeholder={
            plant && locationOptions.length === 0
              ? tr("production.inventory.noStorageLocationMovedUnassigned")
              : tr("common.unassigned")
          }
          value={locationId}
        />
        <Select
          clearable
          data={shelfOptions}
          disabled={!location || shelfOptions.length === 0}
          label={
            <HelpLabel
              {...fieldHelp(tr, "productInventory", "location", {
                label: tr("production.inventory.shelf"),
              })}
            />
          }
          onChange={setShelfId}
          placeholder={
            location && shelfOptions.length === 0
              ? tr("production.stockTransferModal.noShelves")
              : tr("common.noShelfAssigned")
          }
          value={shelfId}
        />
        <NumberInput
          allowDecimal={!source.integerOnly}
          label={tr("production.stockTransferModal.quantityWithUnit", {
            unit: source.unit,
          })}
          max={source.available}
          min={source.integerOnly ? 1 : 0.001}
          onChange={setQuantity}
          value={quantity}
          withAsterisk
        />
        <Textarea
          label={
            <HelpLabel
              {...fieldHelp(tr, "productInventory", "notes", {
                label: tr("common.notesOptional"),
              })}
            />
          }
          onChange={(e) => setNotes(e.currentTarget.value)}
          rows={2}
          value={notes}
        />
        <Group justify="flex-end" mt="xs">
          <CancelButton onClick={onClose} />
          <PrimaryButton
            disabled={!valid}
            leftSection={<IconArrowsExchange size={14} />}
            loading={pending}
            onClick={submit}
          >
            {tr("production.inventory.move")}
          </PrimaryButton>
        </Group>
      </Stack>
    </Modal>
  );
}
