"use client";

/**
 * OrderAcceptanceCreateForm — 受注請書 手入力作成 (SA13, design.md §8.3)。
 *
 * AI 取込を使わない手入力ルート（source = MANUAL）。顧客 + 明細 1 件以上で
 * DRAFT の受注請書を直接作成し、詳細ページへ遷移する。
 */

import { SimpleGrid, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchCustomerOptions } from "@/app/(dashboard)/_shared/option-search";
import { createManualAcceptance } from "@/app/(dashboard)/sales/order-acceptances/actions";
import { CUSTOMER_F4 } from "@/components/ui/f4-presets";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import {
  type ItemRowForm,
  newItemRow,
  OrderAcceptanceItemsEditor,
  toItemPayload,
} from "./OrderAcceptanceItemsEditor";

const BASE_PATH = "/sales/order-acceptances";

export function OrderAcceptanceCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerOrderRef, setCustomerOrderRef] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [orderDate, setOrderDate] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRowForm[]>([newItemRow()]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!customerId) {
      setCustomerError("顧客を選択してください");
      return;
    }
    startTransition(async () => {
      const result = await createManualAcceptance({
        customerBpId: customerId,
        customerOrderRef: customerOrderRef || null,
        quoteNumber: quoteNumber || null,
        orderDate,
        notes: notes || null,
        items: toItemPayload(items),
      });
      if (result.ok) {
        notifications.show({
          title: "作成しました",
          message: `受注請書 ${result.data.number}（下書き）`,
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.number}`);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        "販売",
        { label: "受注請書", href: BASE_PATH },
        "手入力で新規",
      ]}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={handleSubmit}
      submitLabel="下書きを作成"
      title="受注請書 手入力作成"
    >
      <FormSection
        description="注文書の自動取込を使わずに受注請書を直接作成します（下書きとして保存）。"
        title="基本情報"
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <SearchSelect
            error={customerError}
            f4={CUSTOMER_F4}
            label="顧客"
            onChange={(v) => {
              setCustomerId(v);
              if (v) setCustomerError(null);
            }}
            onSearch={searchCustomerOptions}
            placeholder="顧客を検索"
            storageKey="customer"
            value={customerId}
            withAsterisk
          />
          <TextInput
            label="顧客注文書番号"
            onChange={(e) => setCustomerOrderRef(e.currentTarget.value)}
            placeholder="注文書の番号"
            value={customerOrderRef}
          />
          <TextInput
            label="見積書番号（任意）"
            onChange={(e) => setQuoteNumber(e.currentTarget.value)}
            placeholder="QOT-YYYYMM-NNNNN"
            value={quoteNumber}
          />
          <DatePickerInput
            clearable
            label="注文日"
            leftSection={<IconCalendar size={14} />}
            onChange={setOrderDate}
            placeholder="日付を選択"
            value={orderDate}
            valueFormat="YYYY/MM/DD"
          />
          <TextInput
            label="備考"
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder="備考（任意）"
            value={notes}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection
        description="明細ごとに製品・数量を入力します（単価は下書きで後入力も可）。"
        title="明細"
      >
        <OrderAcceptanceItemsEditor items={items} onChange={setItems} />
      </FormSection>
    </FormShell>
  );
}
