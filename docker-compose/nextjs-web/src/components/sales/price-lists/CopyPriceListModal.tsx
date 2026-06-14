"use client";

/**
 * CopyPriceListModal — 「別の顧客・製品へコピー」 (design.md §10.4).
 *
 * Copies a (顧客, 製品, 注文種別) entry's 段階 (数量範囲 → 単価) to a different
 * target 顧客 / 製品 / 注文種別 with a fresh 有効期間. Unlike 「有効期間を変えて
 * 複製」 (same identity, new period), this re-targets the price sheet.
 */

import { Alert, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";
import {
  CUSTOMERS,
  ORDER_TYPE_LABEL,
  ORDER_TYPE_OPTIONS,
  PRODUCTS,
} from "@/lib/mock";
import { entryKey, type PriceListEntry, requiresEndDate } from "./mock";

export function CopyPriceListModal({
  opened,
  onClose,
  source,
}: ModalBaseProps & { source: PriceListEntry | null }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<string | null>(
    source?.orderType ?? null,
  );
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCustomerId(null);
    setProductId(null);
    setOrderType(source?.orderType ?? null);
    setValidFrom(null);
    setValidUntil(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const tierCount = source?.tiers.length ?? 0;

  return (
    <FormModal
      onClose={handleClose}
      onSubmit={(e) => {
        e.preventDefault();
        const needsEnd = !!orderType && requiresEndDate(orderType);
        if (
          !(customerId && productId && orderType && validFrom) ||
          (needsEnd && !validUntil)
        ) {
          setError(
            needsEnd
              ? "コピー先の顧客・製品・注文種別・有効期間（開始・終了）を入力してください"
              : "コピー先の顧客・製品・注文種別・有効開始日を入力してください",
          );
          return;
        }
        // TODO(server-action): create a new entry at the target identity,
        // copying source.tiers + currency.
        notifications.show({
          title: "コピーしました",
          message: "価格表を別の顧客・製品にコピーしました",
          color: "green",
        });
        const targetId = entryKey(customerId, productId, orderType);
        handleClose();
        router.push(`/sales/price-lists/${targetId}`);
      }}
      opened={opened}
      size="md"
      submitLabel="コピーして作成"
      title="価格表を別の顧客・製品へコピー"
    >
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">
          「{source?.productName}
          」（{source ? ORDER_TYPE_LABEL[source.orderType] : "—"}） の
          {tierCount}
          段階をコピー先に複製します。コピー先の有効期間を設定してください。
        </Text>
      </Alert>

      <Select
        data={CUSTOMERS}
        error={error && !customerId ? "顧客を選択してください" : undefined}
        label="コピー先 顧客"
        onChange={setCustomerId}
        placeholder="顧客を選択"
        searchable
        value={customerId}
        withAsterisk
      />
      <Select
        data={PRODUCTS}
        error={error && !productId ? "製品を選択してください" : undefined}
        label="コピー先 製品"
        onChange={setProductId}
        placeholder="製品を選択"
        searchable
        value={productId}
        withAsterisk
      />
      <Select
        data={ORDER_TYPE_OPTIONS}
        label="注文種別"
        onChange={setOrderType}
        value={orderType}
        withAsterisk
      />
      <DatePickerInput
        error={error && !validFrom ? "有効開始日を選択してください" : undefined}
        label="有効開始日"
        leftSection={<IconCalendar size={14} />}
        onChange={setValidFrom}
        placeholder="日付を選択"
        value={validFrom}
        valueFormat="YYYY/MM/DD"
        withAsterisk
      />
      <DatePickerInput
        clearable={!(orderType && requiresEndDate(orderType))}
        description={
          orderType && requiresEndDate(orderType)
            ? "テスト・サンプルは終了日が必須"
            : undefined
        }
        error={
          error && orderType && requiresEndDate(orderType) && !validUntil
            ? "有効終了日を選択してください"
            : undefined
        }
        label="有効終了日"
        leftSection={<IconCalendar size={14} />}
        onChange={setValidUntil}
        placeholder={
          orderType && requiresEndDate(orderType)
            ? "日付を選択"
            : "空欄で無期限"
        }
        value={validUntil}
        valueFormat="YYYY/MM/DD"
        withAsterisk={!!orderType && requiresEndDate(orderType)}
      />
    </FormModal>
  );
}
