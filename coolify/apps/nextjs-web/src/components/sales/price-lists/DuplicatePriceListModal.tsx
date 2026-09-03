"use client";

/**
 * DuplicatePriceListModal — 「有効期間を変更」 (design.md §10.4).
 *
 * (顧客, 製品) は自然キーで一意のため、同一キーの複製行は存在できない —
 * 価格改定は選んだ注文種別バリアントの有効期間を新しい期間に付け替える。
 * 内容（基準単価・全段階）はそのまま維持される。(Differs from
 * CopyPriceListModal, which re-targets a different 顧客・製品.)
 */

import { Alert, Select, Table, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { changePriceEntryPeriod } from "@/app/(dashboard)/sales/price-lists/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { FieldValue } from "@/components/ui/FieldValue";
import { MoneyText } from "@/components/ui/MoneyText";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import {
  type PriceListEntry,
  quantityRange,
  requiresEndDate,
  tierUnitPrice,
  validPeriod,
} from "./model";

export function DuplicatePriceListModal({
  opened,
  onClose,
  source,
  onDone,
}: ModalBaseProps & {
  source: PriceListEntry | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const [isPending, startTransition] = useTransition();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset the fields whenever a new source is opened.
  useEffect(() => {
    if (opened) {
      setVariantId(source?.variants[0]?.id ?? null);
      setValidFrom(null);
      setValidUntil(null);
      setError(null);
    }
  }, [opened, source]);

  const handleClose = () => {
    setVariantId(null);
    setValidFrom(null);
    setValidUntil(null);
    setError(null);
    onClose();
  };

  const variant = source?.variants.find((v) => v.id === variantId) ?? null;
  const needsEnd = !!variant && requiresEndDate(variant.orderType);

  return (
    <FormModal
      loading={isPending}
      onClose={handleClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (!(source && variant)) return;
        if (!validFrom) {
          setError(tr("sales.priceLists.selectAStartDate"));
          return;
        }
        if (needsEnd && !validUntil) {
          setError(tr("common.testAndSamplePricesNeedAn"));
          return;
        }
        startTransition(async () => {
          const result = await changePriceEntryPeriod({
            entryNumber: source.entryId,
            variantId: variant.id,
            validFrom,
            validUntil,
          });
          if (result.ok) {
            notifications.show({
              title: tr("sales.priceLists.theValidPeriodWasChanged"),
              message: tr("sales.priceLists.switchedToANewValidPeriod"),
              color: "green",
            });
            handleClose();
            onDone?.();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      size="md"
      submitLabel={tr("common.changeTheValidPeriod")}
      title={tr("common.changeTheValidPeriod")}
    >
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">{tr("sales.priceLists.keepsTheChosenOrderTypeS")}</Text>
      </Alert>

      <FieldValue label={tr("common.customer")} value={source?.customerName} />
      <FieldValue label={tr("common.product")} value={source?.productName} />
      <Select
        data={
          source?.variants.map((v) => ({
            value: v.id,
            label: ORDER_TYPE_LABEL[v.orderType] ?? v.orderType,
          })) ?? []
        }
        label={tr("common.orderType")}
        onChange={setVariantId}
        value={variantId}
        withAsterisk
      />
      <FieldValue
        label={tr("sales.priceLists.currentValidPeriod")}
        value={
          variant
            ? validPeriod(fmt, variant.validFrom, variant.validUntil, tr)
            : undefined
        }
      />

      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{tr("common.quantityRange")}</Table.Th>
            <Table.Th ta="right">{tr("common.unitPrice")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {variant?.tiers.map((tier) => (
            <Table.Tr key={tier.id}>
              <Table.Td>
                {quantityRange(tier.minQuantity, tier.maxQuantity, tr)}
              </Table.Td>
              <Table.Td ta="right">
                <MoneyText
                  currency={source?.currency}
                  value={tierUnitPrice(variant, tier)}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <DatePickerInput
        error={error && !validFrom ? error : undefined}
        label={tr("sales.priceLists.newStartDate")}
        leftSection={<IconCalendar size={14} />}
        onChange={setValidFrom}
        placeholder={tr("common.pickADate")}
        value={validFrom}
        valueFormat="YYYY/MM/DD"
        withAsterisk
      />
      <DatePickerInput
        clearable={!needsEnd}
        description={
          needsEnd
            ? tr("sales.priceLists.testAndSampleEntriesNeedAn")
            : undefined
        }
        error={
          error && needsEnd && !validUntil
            ? tr("common.selectAnEndDate")
            : undefined
        }
        label={tr("sales.priceLists.newEndDate")}
        leftSection={<IconCalendar size={14} />}
        onChange={setValidUntil}
        placeholder={
          needsEnd
            ? tr("common.pickADate")
            : tr("common.leaveBlankForNoEndDate")
        }
        value={validUntil}
        valueFormat="YYYY/MM/DD"
        withAsterisk={needsEnd}
      />
    </FormModal>
  );
}
