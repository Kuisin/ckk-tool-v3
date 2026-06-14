"use client";

/**
 * ConvertToPriceListModal — 試算 → 価格表 変換.
 *
 * Creates a new 価格表 entry from a saved 試算: the lot tiers become 数量範囲 →
 * 単価 (= 見積単価, which already reflects any custom 掛け率). The user picks the
 * 製品 / 注文種別 / 有効期間; the modal always warns if a price list for the same
 * 顧客・製品 already exists.
 */

import { Alert, Select, Table, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCalendar } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoneyText } from "@/components/ui/MoneyText";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";
import {
  CUSTOMERS,
  ORDER_TYPE_LABEL,
  ORDER_TYPE_OPTIONS,
  PRODUCTS,
} from "@/lib/mock";
import { calcTrialPricing } from "@/lib/trial-pricing";
import {
  findEntriesByCustomerProduct,
  requiresEndDate,
} from "../price-lists/mock";
import type { TrialEstimateRecord } from "./mock";

export function ConvertToPriceListModal({
  opened,
  onClose,
  estimate,
}: ModalBaseProps & { estimate: TrialEstimateRecord | null }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string | null>(
    estimate?.customerId ?? null,
  );
  const [productId, setProductId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<string>("PRODUCTION");
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tiers from the estimate's lot results (見積単価 includes custom 掛け率).
  const lots = estimate ? calcTrialPricing(estimate.input).lots : [];
  const needsEnd = requiresEndDate(orderType);
  const existing = findEntriesByCustomerProduct(customerId, productId);
  const dup = existing.some((e) => e.orderType === orderType);

  const handleClose = () => {
    setProductId(null);
    setOrderType("PRODUCTION");
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
        if (
          !(customerId && productId && validFrom) ||
          (needsEnd && !validUntil)
        ) {
          setError(
            needsEnd
              ? "顧客・製品・注文種別・有効期間（開始・終了）を入力してください"
              : "顧客・製品・有効開始日を入力してください",
          );
          return;
        }
        // TODO(server-action): create a price_list_entry + tiers from the lots.
        notifications.show({
          title: "価格表を作成しました",
          message: "試算から新しい価格表を作成しました",
          color: "green",
        });
        handleClose();
        router.push("/sales/price-lists");
      }}
      opened={opened}
      size="lg"
      submitLabel="価格表を作成"
      title="試算から価格表を作成"
    >
      <Select
        data={CUSTOMERS}
        error={error && !customerId ? "顧客を選択してください" : undefined}
        label="顧客"
        onChange={setCustomerId}
        placeholder="顧客を選択"
        searchable
        value={customerId}
        withAsterisk
      />
      <Select
        data={PRODUCTS}
        error={error && !productId ? "製品を選択してください" : undefined}
        label="製品"
        onChange={setProductId}
        placeholder="製品を選択"
        searchable
        value={productId}
        withAsterisk
      />
      <Select
        data={ORDER_TYPE_OPTIONS}
        label="注文種別"
        onChange={(v) => setOrderType(v ?? "PRODUCTION")}
        value={orderType}
        withAsterisk
      />

      {existing.length > 0 && (
        <Alert
          color={dup ? "red" : "orange"}
          icon={<IconAlertTriangle size={16} />}
          variant="light"
        >
          同一顧客・製品の価格表が既に {existing.length} 件あります（
          {existing.map((e) => ORDER_TYPE_LABEL[e.orderType]).join("・")}）。
          {dup && " 選択中の注文種別は既に存在します。"}
        </Alert>
      )}

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
        description={needsEnd ? "テスト・サンプルは終了日が必須" : undefined}
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

      <div>
        <Text c="dimmed" mb={4} size="xs">
          価格段階（試算のロットより）
        </Text>
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>数量範囲</Table.Th>
              <Table.Th ta="right">単価</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lots.map((l) => (
              <Table.Tr key={l.lotIndex}>
                <Table.Td>{l.quantity}本〜</Table.Td>
                <Table.Td ta="right">
                  <MoneyText value={l.estimateUnitPrice} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </FormModal>
  );
}
