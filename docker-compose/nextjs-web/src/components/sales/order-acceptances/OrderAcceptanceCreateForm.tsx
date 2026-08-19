"use client";

/**
 * OrderAcceptanceCreateForm — 注文請書 手入力作成 (SA14, design.md §8.3)。
 *
 * AI 取込を使わない手入力ルート（source = MANUAL）。顧客 + 明細 1 件以上で
 * DRAFT の注文請書を直接作成し、詳細ページへ遷移する。
 */

import { SimpleGrid, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  searchCustomerOptions,
  searchQuoteOptions,
} from "@/app/(dashboard)/_shared/option-search";
import { createManualAcceptance } from "@/app/(dashboard)/sales/order-acceptances/actions";
import { CUSTOMER_F4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SalesRepSelect } from "@/components/ui/SalesRepSelect";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { fieldHelp } from "@/lib/field-help";
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
  const [salesRepId, setSalesRepId] = useState<string | null>(null);
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
        salesRepId,
        customerOrderRef: customerOrderRef || null,
        quoteNumber: quoteNumber || null,
        orderDate,
        notes: notes || null,
        items: toItemPayload(items),
      });
      if (result.ok) {
        notifications.show({
          title: "作成しました",
          message: `注文請書 ${result.data.number}（下書き）`,
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

  // 初期状態（空のスカラー + 既定値の 1 行）から変化していれば未保存とみなす。
  const isDirty =
    Boolean(
      customerId ||
        salesRepId ||
        customerOrderRef ||
        quoteNumber ||
        orderDate ||
        notes,
    ) ||
    items.length > 1 ||
    items.some(
      (it) =>
        it.productId ||
        it.productText ||
        it.unitPrice != null ||
        it.deliveryDate ||
        it.notes ||
        it.quantity !== 1 ||
        it.orderType !== "PRODUCTION",
    );

  return (
    <FormShell
      breadcrumbs={[
        "販売",
        { label: "注文請書", href: BASE_PATH },
        "手入力で新規",
      ]}
      isDirty={isDirty}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={handleSubmit}
      submitLabel="下書きを作成"
      title="注文請書 手入力作成"
    >
      <FormSection
        description="注文書の自動取込を使わずに注文請書を直接作成します（下書きとして保存）。"
        title="基本情報"
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <SearchSelect
            error={customerError}
            f4={CUSTOMER_F4}
            label={<HelpLabel {...fieldHelp("orderAcceptance", "customer")} />}
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
          <SalesRepSelect
            customerBpId={customerId}
            onChange={setSalesRepId}
            value={salesRepId}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("orderAcceptance", "customerOrderRef")}
              />
            }
            onChange={(e) => setCustomerOrderRef(e.currentTarget.value)}
            placeholder="注文書の番号"
            value={customerOrderRef}
          />
          {/* 手入力ではなく検索して選ぶ（顧客が決まっていればその顧客の見積だけ）。 */}
          <SearchSelect
            clearable
            label={
              <HelpLabel
                {...fieldHelp("orderAcceptance", "quoteNumber", {
                  label: "見積書（任意）",
                })}
              />
            }
            onChange={(v) => setQuoteNumber(v ?? "")}
            onSearch={(q) => searchQuoteOptions(q, customerId)}
            placeholder={
              customerId ? "見積書を検索" : "先に顧客を選ぶと絞り込めます"
            }
            storageKey="quote"
            value={quoteNumber || null}
          />
          <DatePickerInput
            clearable
            label={<HelpLabel {...fieldHelp("orderAcceptance", "orderDate")} />}
            leftSection={<IconCalendar size={14} />}
            onChange={setOrderDate}
            placeholder="日付を選択"
            value={orderDate}
            valueFormat="YYYY/MM/DD"
          />
          <TextInput
            label={<HelpLabel {...fieldHelp("orderAcceptance", "notes")} />}
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
