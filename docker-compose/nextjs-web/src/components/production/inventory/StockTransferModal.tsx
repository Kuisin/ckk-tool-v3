"use client";

/**
 * StockTransferModal — 在庫移動（在庫管理 PD04）。
 *
 * 移動元（在庫行）から 移動先 = 工場 → 保管場所 → 棚 を選んで数量を移す。
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
import { useMemo, useState, useTransition } from "react";
import { transferStock } from "@/app/(dashboard)/production/inventory/actions";
import { CancelButton, PrimaryButton } from "@/components/ui/buttons";

/** 移動先の選択肢（工場 → 保管場所 → 棚。サーバーで有効行のみに整形済み）。 */
export interface TransferFactoryOption {
  id: number;
  name: string;
  locations: {
    id: number;
    code: string;
    name: string;
    shelves: { id: number; code: string; name: string | null }[];
  }[];
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
  /** 現在の場所ラベル（工場 / 保管場所 / 棚）。 */
  currentLabel: string;
}

export function StockTransferModal({
  source,
  factories,
  onClose,
  onDone,
}: {
  source: TransferSource;
  factories: TransferFactoryOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [factoryId, setFactoryId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number | string>("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const factory = factories.find((f) => String(f.id) === factoryId) ?? null;
  const location =
    factory?.locations.find((l) => String(l.id) === locationId) ?? null;

  const locationOptions = useMemo(
    () =>
      (factory?.locations ?? []).map((l) => ({
        value: String(l.id),
        label: `${l.name}（${l.code}）`,
      })),
    [factory],
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
  const valid = factoryId != null && qty > 0 && qty <= source.available;

  function submit() {
    if (!valid || !factoryId) return;
    startTransition(async () => {
      const res = await transferStock({
        inventoryType: source.inventoryType,
        inventoryId: source.inventoryId,
        quantity: qty,
        targetFactoryId: Number(factoryId),
        targetStorageLocationId: locationId ? Number(locationId) : null,
        targetShelfId: shelfId ? Number(shelfId) : null,
        notes: notes || undefined,
      });
      if (!res.ok) {
        notifications.show({
          title: "在庫移動に失敗しました",
          message: res.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: "在庫を移動しました",
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
            在庫移動
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
          data={factories.map((f) => ({
            value: String(f.id),
            label: f.name,
          }))}
          label="移動先の工場"
          onChange={(v) => {
            setFactoryId(v);
            setLocationId(null);
            setShelfId(null);
          }}
          placeholder="選択"
          searchable
          value={factoryId}
          withAsterisk
        />
        <Select
          clearable
          data={locationOptions}
          disabled={!factory}
          label="保管場所"
          onChange={(v) => {
            setLocationId(v);
            setShelfId(null);
          }}
          placeholder={
            factory && locationOptions.length === 0
              ? "保管場所なし（未割当のまま移動）"
              : "未割当"
          }
          value={locationId}
        />
        <Select
          clearable
          data={shelfOptions}
          disabled={!location || shelfOptions.length === 0}
          label="棚"
          onChange={setShelfId}
          placeholder={
            location && shelfOptions.length === 0 ? "棚なし" : "棚未割当"
          }
          value={shelfId}
        />
        <NumberInput
          allowDecimal={!source.integerOnly}
          label={`数量（${source.unit}）`}
          max={source.available}
          min={source.integerOnly ? 1 : 0.001}
          onChange={setQuantity}
          value={quantity}
          withAsterisk
        />
        <Textarea
          label="備考（任意）"
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
            移動する
          </PrimaryButton>
        </Group>
      </Stack>
    </Modal>
  );
}
