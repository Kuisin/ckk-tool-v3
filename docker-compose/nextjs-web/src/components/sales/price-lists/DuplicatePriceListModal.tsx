"use client";

/**
 * DuplicatePriceListModal — "有効期間を変えて複製" (design.md §10.4).
 *
 * Copies the WHOLE entry (同じ 顧客・製品・注文種別 と全段階) to a new 有効期間.
 * Identity + tiers are carried over as-is — only the period changes. (Differs
 * from CopyPriceListModal, which re-targets a different 顧客・製品.)
 */

import { Alert, Table, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconInfoCircle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { FieldValue } from "@/components/ui/FieldValue";
import { MoneyText } from "@/components/ui/MoneyText";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { type PriceListEntry, quantityRange, validPeriod } from "./mock";

export function DuplicatePriceListModal({
  opened,
  onClose,
  source,
}: ModalBaseProps & { source: PriceListEntry | null }) {
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
      onClose={handleClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (!validFrom) {
          setError("有効開始日を選択してください");
          return;
        }
        // TODO(server-action): clone source (identity + tiers + currency) into a
        // new entry with the chosen period.
        notifications.show({
          title: "複製しました",
          message: "同じ内容で新しい有効期間の価格表を作成しました",
          color: "green",
        });
        handleClose();
      }}
      opened={opened}
      size="md"
      submitLabel="複製して作成"
      title="有効期間を変えて複製"
    >
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">
          下記の内容（顧客・製品・注文種別・全段階）をそのまま複製します。新しい有効期間を設定してください。
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
                <MoneyText currency={source.currency} value={tier.unitPrice} />
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
        clearable
        label="新しい有効終了日"
        leftSection={<IconCalendar size={14} />}
        onChange={setValidUntil}
        placeholder="空欄で無期限"
        value={validUntil}
        valueFormat="YYYY/MM/DD"
      />
    </FormModal>
  );
}
