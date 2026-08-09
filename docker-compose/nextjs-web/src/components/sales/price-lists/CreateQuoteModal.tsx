"use client";

/**
 * CreateQuoteModal — 価格表 → 見積書 作成.
 *
 * 見積書は印刷用ドキュメント — 価格は価格表からのみ解決する。単価（基準単価 ×
 * 数量倍率）と値引き（値引きルール）は 注文種別 × 数量 から自動計算され、
 * 手入力はない。ユーザーが決めるのは 注文種別 / 数量 / 納期 のみ。Submitting
 * opens the 見積書 form pre-filled so the draft can be reviewed and saved.
 */

import { Alert, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconAlertTriangle, IconCalendar } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FieldValue } from "@/components/ui/FieldValue";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";
import { formatMoney } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import {
  discountValueLabel,
  findApplicableDiscount,
  type PriceListEntry,
  quantityRange,
  tierUnitPrice,
  unitDiscountOf,
} from "./model";

export function CreateQuoteModal({
  opened,
  onClose,
  source,
}: ModalBaseProps & { source: PriceListEntry | null }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);

  // Re-seed the defaults each time the modal opens for a (new) entry.
  useEffect(() => {
    if (opened && source) {
      const first = source.variants[0] ?? null;
      setVariantId(first?.id ?? null);
      setQuantity(first?.tiers[0]?.minQuantity ?? 1);
      setDeliveryDate(null);
    }
  }, [opened, source]);

  if (!source) return null;

  const variant = source.variants.find((v) => v.id === variantId) ?? null;

  // 注文種別 × 数量 → 価格表 tier（基準単価 × 倍率）+ 値引きルールの自動適用。
  const tier = variant?.tiers.find(
    (t) =>
      quantity >= t.minQuantity &&
      (t.maxQuantity == null || quantity <= t.maxQuantity),
  );
  const unitPrice = variant && tier ? tierUnitPrice(variant, tier) : 0;
  const discount =
    variant && tier
      ? findApplicableDiscount(variant, quantity, unitPrice)
      : null;
  const discountAmount = discount
    ? unitDiscountOf(discount, unitPrice) * quantity
    : 0;
  const amount = Math.max(0, quantity * unitPrice - discountAmount);

  const handleClose = () => {
    setVariantId(null);
    setQuantity(1);
    setDeliveryDate(null);
    onClose();
  };

  return (
    <FormModal
      onClose={handleClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (!variant) return;
        // TODO(server-action): create the DRAFT quote directly; for now the
        // 見積書 form opens pre-filled with this entry's line.
        const params = new URLSearchParams({
          customer: source.customerId,
          product: source.productId,
          orderType: variant.orderType,
          quantity: String(quantity),
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
        の価格表から見積書を作成します。単価・値引きは価格表から自動計算されます。
      </Text>

      <Select
        data={source.variants.map((v) => ({
          value: v.id,
          label: ORDER_TYPE_LABEL[v.orderType] ?? v.orderType,
        }))}
        label="注文種別"
        onChange={(v) => {
          setVariantId(v);
          const next = source.variants.find((x) => x.id === v);
          setQuantity(next?.tiers[0]?.minQuantity ?? 1);
        }}
        value={variantId}
        withAsterisk
      />

      <NumberInput
        label={
          <HelpLabel
            help="見積する本数。数量帯（倍率）と値引きルールの適用判定に使われます。"
            label="数量"
          />
        }
        min={1}
        onChange={(v) => setQuantity(typeof v === "number" ? v : 1)}
        suffix=" 本"
        value={quantity}
        withAsterisk
      />

      {variant && tier ? (
        <Stack gap="xs">
          <FieldValue
            label="単価（価格表）"
            value={`${formatMoney(unitPrice)}（${quantityRange(
              tier.minQuantity,
              tier.maxQuantity,
            )} ×${tier.multiplier.toFixed(2)}）`}
          />
          <FieldValue
            label="値引き（自動適用）"
            value={
              discount
                ? `-${formatMoney(discountAmount)}（${discount.label} ${discountValueLabel(discount)}）`
                : "—"
            }
          />
        </Stack>
      ) : (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
        >
          この数量に該当する価格段階がありません。数量を見直すか、価格表の数量スケールを追加してください。
        </Alert>
      )}

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
