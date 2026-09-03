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
import { useTranslations } from "next-intl";
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
  const tr = useTranslations();
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
      submitLabel={tr("sales.priceLists.createAQuoteDraft")}
      title={tr("common.createAQuote")}
    >
      <Text size="sm">
        {tr("sales.createQuoteModal.createQuoteFromPriceListMessage", {
          customer: source.customerName,
          product: source.productName,
        })}
      </Text>

      <Select
        data={source.variants.map((v) => ({
          value: v.id,
          label: ORDER_TYPE_LABEL[v.orderType] ?? v.orderType,
        }))}
        label={tr("common.orderType")}
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
            help={tr("sales.priceLists.howManyAreQuotedUsedTo")}
            label={tr("common.quantity")}
          />
        }
        min={1}
        onChange={(v) => setQuantity(typeof v === "number" ? v : 1)}
        suffix={` ${tr("common.pcs")}`}
        value={quantity}
        withAsterisk
      />

      {variant && tier ? (
        <Stack gap="xs">
          <FieldValue
            label={tr("common.unitPricePriceList")}
            value={`${formatMoney(unitPrice)}（${quantityRange(
              tier.minQuantity,
              tier.maxQuantity,
              tr,
            )} ×${tier.multiplier.toFixed(2)}）`}
          />
          <FieldValue
            label={tr("sales.priceLists.discountAppliedAutomatically")}
            value={
              discount
                ? `-${formatMoney(discountAmount)}（${discount.label} ${discountValueLabel(discount, tr)}）`
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
          {tr("sales.priceLists.noPriceTierCoversThisQuantity")}
        </Alert>
      )}

      <DatePickerInput
        clearable
        label={tr("common.deliveryDate")}
        leftSection={<IconCalendar size={14} />}
        onChange={setDeliveryDate}
        placeholder={tr("common.pickADate")}
        value={deliveryDate}
        valueFormat="YYYY/MM/DD"
      />

      <Group justify="flex-end">
        <Text c="dimmed" size="sm">
          {tr("common.amount")}
        </Text>
        <Text className="tabular-nums" ff="mono" fw={700}>
          {formatMoney(amount)}
        </Text>
      </Group>
    </FormModal>
  );
}
