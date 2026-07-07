"use client";

/**
 * DuplicatePriceListModal — 「有効期間を変更」 (design.md §10.4).
 *
 * (顧客, 製品, 注文種別) は自然複合キーで一意のため、同一キーの複製行は
 * 存在できない — 価格改定は同じエントリの有効期間を新しい期間に付け替える。
 * 内容（基準単価・全段階）はそのまま維持される。(Differs from
 * CopyPriceListModal, which re-targets a different 顧客・製品.)
 */

import { Alert, Table, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconInfoCircle } from "@tabler/icons-react";
import { useEffect, useState, useTransition } from "react";
import { changePriceEntryPeriod } from "@/app/(dashboard)/sales/price-lists/actions";
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
  const [isPending, startTransition] = useTransition();
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset the period fields whenever a new source is opened.
  useEffect(() => {
    if (opened) {
      setValidFrom(null);
      setValidUntil(null);
      setError(null);
    }
  }, [opened]);

  const handleClose = () => {
    setValidFrom(null);
    setValidUntil(null);
    setError(null);
    onClose();
  };

  return (
    <FormModal
      loading={isPending}
      onClose={handleClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (!source) return;
        const needsEnd = requiresEndDate(source.orderType);
        if (!validFrom) {
          setError("有効開始日を選択してください");
          return;
        }
        if (needsEnd && !validUntil) {
          setError("テスト・サンプルは有効終了日が必須です");
          return;
        }
        startTransition(async () => {
          const result = await changePriceEntryPeriod({
            entryNumber: source.entryId,
            validFrom,
            validUntil,
          });
          if (result.ok) {
            notifications.show({
              title: "有効期間を変更しました",
              message: "同じ内容のまま新しい有効期間に切り替えました",
              color: "green",
            });
            handleClose();
            onDone?.();
          } else {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      size="md"
      submitLabel="有効期間を変更"
      title="有効期間を変更"
    >
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">
          下記の内容（顧客・製品・注文種別・全段階）はそのままに、有効期間だけを新しい期間へ付け替えます。
        </Text>
      </Alert>

      <FieldValue label="顧客" value={source?.customerName} />
      <FieldValue label="製品" value={source?.productName} />
      <FieldValue
        label="注文種別"
        value={source ? ORDER_TYPE_LABEL[source.orderType] : undefined}
      />
      <FieldValue
        label="現在の有効期間"
        value={
          source ? validPeriod(source.validFrom, source.validUntil) : undefined
        }
      />

      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>数量範囲</Table.Th>
            <Table.Th ta="right">単価</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {source?.tiers.map((tier) => (
            <Table.Tr key={tier.id}>
              <Table.Td>
                {quantityRange(tier.minQuantity, tier.maxQuantity)}
              </Table.Td>
              <Table.Td ta="right">
                <MoneyText
                  currency={source.currency}
                  value={tierUnitPrice(source, tier)}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <DatePickerInput
        error={error && !validFrom ? error : undefined}
        label="新しい有効開始日"
        leftSection={<IconCalendar size={14} />}
        onChange={setValidFrom}
        placeholder="日付を選択"
        value={validFrom}
        valueFormat="YYYY/MM/DD"
        withAsterisk
      />
      <DatePickerInput
        clearable={!(source && requiresEndDate(source.orderType))}
        description={
          source && requiresEndDate(source.orderType)
            ? "テスト・サンプルは終了日が必須"
            : undefined
        }
        error={
          error && source && requiresEndDate(source.orderType) && !validUntil
            ? "有効終了日を選択してください"
            : undefined
        }
        label="新しい有効終了日"
        leftSection={<IconCalendar size={14} />}
        onChange={setValidUntil}
        placeholder={
          source && requiresEndDate(source.orderType)
            ? "日付を選択"
            : "空欄で無期限"
        }
        value={validUntil}
        valueFormat="YYYY/MM/DD"
        withAsterisk={!!source && requiresEndDate(source.orderType)}
      />
    </FormModal>
  );
}
