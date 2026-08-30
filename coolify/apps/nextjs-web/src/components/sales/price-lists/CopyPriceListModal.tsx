"use client";

/**
 * CopyPriceListModal — 「別の顧客・製品へコピー」 (design.md §10.4).
 *
 * Copies a (顧客, 製品) entry's 全注文種別バリアント（基準単価 + 段階）to a
 * different target 顧客 / 製品 with a fresh 有効期間 (Server Action). Unlike
 * 「有効期間を変更」 (same identity), this re-targets the price sheet.
 * 価格試算リンクは引き継がない（手動エントリとして作成）。
 */

import { Alert, Select, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { copyPriceEntry } from "@/app/(dashboard)/sales/price-lists/actions";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";
import type { Option } from "@/lib/mock";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { type PriceListEntry, requiresEndDate } from "./model";

export function CopyPriceListModal({
  opened,
  onClose,
  source,
  customerOptions,
  productOptions,
}: ModalBaseProps & {
  source: PriceListEntry | null;
  customerOptions: Option[];
  productOptions: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCustomerId(null);
    setProductId(null);
    setValidFrom(null);
    setValidUntil(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // テスト・サンプルのバリアントを含む場合は終了日が必須（全バリアント共通期間）。
  const needsEnd = !!source?.variants.some((v) => requiresEndDate(v.orderType));
  const orderTypeLabels =
    source?.variants
      .map((v) => ORDER_TYPE_LABEL[v.orderType] ?? v.orderType)
      .join("・") ?? "—";

  return (
    <FormModal
      loading={isPending}
      onClose={handleClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (!source) return;
        if (
          !(customerId && productId && validFrom) ||
          (needsEnd && !validUntil)
        ) {
          setError(
            needsEnd
              ? "コピー先の顧客・製品・有効期間（開始・終了）を入力してください"
              : "コピー先の顧客・製品・有効開始日を入力してください",
          );
          return;
        }
        startTransition(async () => {
          const result = await copyPriceEntry({
            sourceEntryNumber: source.entryId,
            targetIdentity: {
              customerBpId: customerId,
              productId,
            },
            validFrom,
            validUntil,
          });
          if (result.ok) {
            notifications.show({
              title: "コピーしました",
              message: "価格表を別の顧客・製品にコピーしました",
              color: "green",
            });
            handleClose();
            router.push(`/sales/price-lists/${result.data.entryId}`);
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
      submitLabel="コピーして作成"
      title="価格表を別の顧客・製品へコピー"
    >
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">
          「{source?.productName}
          」の全注文種別（{orderTypeLabels}
          ）をコピー先に複製します。コピー先の有効期間（全種別共通）を設定してください。
        </Text>
      </Alert>

      <Select
        data={customerOptions}
        error={error && !customerId ? "顧客を選択してください" : undefined}
        label="コピー先 顧客"
        onChange={setCustomerId}
        placeholder="顧客を選択"
        searchable
        value={customerId}
        withAsterisk
      />
      <Select
        data={productOptions}
        error={error && !productId ? "製品を選択してください" : undefined}
        label="コピー先 製品"
        onChange={setProductId}
        placeholder="製品を選択"
        searchable
        value={productId}
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
        clearable={!needsEnd}
        description={
          needsEnd ? "テスト・サンプルの種別を含むため終了日が必須" : undefined
        }
        error={
          error && needsEnd && !validUntil
            ? "有効終了日を選択してください"
            : undefined
        }
        label="有効終了日"
        leftSection={<IconCalendar size={14} />}
        onChange={setValidUntil}
        placeholder={needsEnd ? "日付を選択" : "空欄で無期限"}
        value={validUntil}
        valueFormat="YYYY/MM/DD"
        withAsterisk={needsEnd}
      />
    </FormModal>
  );
}
