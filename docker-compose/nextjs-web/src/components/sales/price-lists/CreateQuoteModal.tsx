"use client";

/**
 * CreateQuoteModal — 価格表 → 見積書 作成.
 *
 * Drafts a 見積書 from a price-list entry: 顧客・製品・注文種別・単価 are
 * inherited from the entry (単価 is resolved from the 数量 tier); the user only
 * sets 数量 / 値引き / 納期. Submitting opens the 見積書 form pre-filled so the
 * draft can be reviewed and saved.
 */

import { Alert, Group, NumberInput, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconAlertTriangle, IconCalendar } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FieldValue } from "@/components/ui/FieldValue";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";
import { formatMoney } from "@/lib/format";
import { type PriceListEntry, quantityRange } from "./mock";

export function CreateQuoteModal({
  opened,
  onClose,
  source,
}: ModalBaseProps & { source: PriceListEntry | null }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState<number>(
    source?.tiers[0]?.minQuantity ?? 1,
  );
  const [discount, setDiscount] = useState<number>(0);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);

  // Re-seed the defaults each time the modal opens for a (new) entry.
  useEffect(() => {
    if (opened && source) {
      setQuantity(source.tiers[0]?.minQuantity ?? 1);
      setDiscount(0);
      setDeliveryDate(null);
    }
  }, [opened, source]);

  if (!source) return null;

  // 数量に対応する価格表 tier（単価は価格表から自動解決）。
  const tier = source.tiers.find(
    (t) =>
      quantity >= t.minQuantity &&
      (t.maxQuantity == null || quantity <= t.maxQuantity),
  );
  const unitPrice = tier?.unitPrice ?? 0;
  const amount = Math.max(0, quantity * unitPrice - discount);

  const handleClose = () => {
    setQuantity(source.tiers[0]?.minQuantity ?? 1);
    setDiscount(0);
    setDeliveryDate(null);
    onClose();
  };

  return (
    <FormModal
      onClose={handleClose}
      onSubmit={(e) => {
        e.preventDefault();
        // TODO(server-action): create the DRAFT quote directly; for now the
        // 見積書 form opens pre-filled with this entry's line.
        const params = new URLSearchParams({
          customer: source.customerId,
          product: source.productId,
          orderType: source.orderType,
          quantity: String(quantity),
          discount: String(discount),
        });
        if (deliveryDate) params.set("delivery", deliveryDate);
        handleClose();
        router.push(`/sales/quotes/new?${params.toString()}`);
      }}
      opened={opened}
      size="md"
      submitLabel="見積書を作成（下書き）"
      title="見積書を作成"
    >
      <Text size="sm">
        {source.customerName} × {source.productName}{" "}
        の価格表から見積書を作成します。単価は価格表から自動解決されます。
      </Text>

      <NumberInput
        label="数量"
        min={1}
        onChange={(v) => setQuantity(typeof v === "number" ? v : 1)}
        suffix=" 本"
        value={quantity}
        withAsterisk
      />

      {tier ? (
        <FieldValue
          label="単価（価格表）"
          value={`${formatMoney(unitPrice)}（${quantityRange(
            tier.minQuantity,
            tier.maxQuantity,
          )}）`}
        />
      ) : (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
        >
          この数量に該当する価格段階がありません。数量を見直すか、見積書側で単価を手動入力してください。
        </Alert>
      )}

      <NumberInput
        description="必要時のみ"
        label="値引き"
        min={0}
        onChange={(v) => setDiscount(typeof v === "number" ? v : 0)}
        prefix="¥"
        thousandSeparator=","
        value={discount}
      />

      <DatePickerInput
        clearable
        label="納期"
        leftSection={<IconCalendar size={14} />}
        onChange={setDeliveryDate}
        placeholder="日付を選択"
        value={deliveryDate}
        valueFormat="YYYY/MM/DD"
      />

      <Group justify="flex-end">
        <Text c="dimmed" size="sm">
          金額
        </Text>
        <Text className="tabular-nums" ff="mono" fw={700}>
          {formatMoney(amount)}
        </Text>
      </Group>
    </FormModal>
  );
}
