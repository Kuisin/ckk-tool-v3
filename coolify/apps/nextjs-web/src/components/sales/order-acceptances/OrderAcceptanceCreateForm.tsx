"use client";

/**
 * OrderAcceptanceCreateForm — 注文請書 手入力作成 (SA14, design.md §8.3)。
 *
 * AI 取込を使わない手入力ルート（source = MANUAL）。顧客 + 明細 1 件以上で
 * DRAFT の注文請書を直接作成し、詳細ページへ遷移する。
 */

import { Select, SimpleGrid, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  searchCustomerOptions,
  searchEndUserOptions,
  searchQuoteOptions,
  searchShipToOptions,
} from "@/app/(dashboard)/_shared/option-search";
import { createManualAcceptance } from "@/app/(dashboard)/sales/order-acceptances/actions";
import { customerF4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SalesRepSelect } from "@/components/ui/SalesRepSelect";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { acceptanceDeliveryMethodOptions } from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { shipToApplies } from "@/lib/order-acceptance-readiness";
import {
  type ItemRowForm,
  newItemRow,
  OrderAcceptanceItemsEditor,
  toItemPayload,
} from "./OrderAcceptanceItemsEditor";
import { usePriceEntries } from "./usePriceEntries";

const BASE_PATH = "/sales/order-acceptances";

export function OrderAcceptanceCreateForm({
  plantOptions,
  workLocationOptions,
}: {
  /** 担当拠点の選択肢（有効のみ — サーバーで取得して渡す）。 */
  plantOptions: { value: string; label: string }[];
  /** 出荷作業場所の選択肢（lib/work-locations fetchWorkLocationOptions）。 */
  workLocationOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [salesRepId, setSalesRepId] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [shipToBpId, setShipToBpId] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<
    "NORMAL" | "DIRECT_TO_USER"
  >("NORMAL");
  const [endUserBpId, setEndUserBpId] = useState<string | null>(null);
  const [endUserError, setEndUserError] = useState<string | null>(null);
  const [assignedPlantId, setAssignedPlantId] = useState<string | null>(null);
  const [shippingWorkLocationId, setShippingWorkLocationId] = useState<
    string | null
  >(null);
  const [customerOrderRef, setCustomerOrderRef] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [orderDate, setOrderDate] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRowForm[]>([newItemRow()]);
  // 明細の単価は既定で価格表が持つ（§2）— 顧客が決まるとその顧客の
  // 価格表を引いて、行ごとの単価をその場で出す。
  const priceEntries = usePriceEntries(customerId);
  const priceContext = { customerBpId: customerId, priceEntries };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!customerId) {
      setCustomerError(tr("sales.orderAcceptances.selectACustomer"));
      return;
    }
    if (deliveryMethod === "DIRECT_TO_USER" && !endUserBpId) {
      setEndUserError(tr("common.selectAnEndUserForDirect"));
      return;
    }
    startTransition(async () => {
      const result = await createManualAcceptance({
        customerBpId: customerId,
        salesRepId,
        shipToBpId,
        deliveryMethod,
        endUserBpId,
        assignedPlantId: assignedPlantId ? Number(assignedPlantId) : null,
        shippingWorkLocationId: shippingWorkLocationId
          ? Number(shippingWorkLocationId)
          : null,
        customerProvidesDeliveryNote: false,
        customerOrderRef: customerOrderRef || null,
        quoteNumber: quoteNumber || null,
        orderDate,
        notes: notes || null,
        items: toItemPayload(items, priceContext, tr),
      });
      if (result.ok) {
        notifications.show({
          title: tr("common.created"),
          message: tr("sales.orderAcceptanceCreateForm.createdDraftMessage", {
            number: result.data.number,
          }),
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.number}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
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
        shipToBpId ||
        deliveryMethod !== "NORMAL" ||
        endUserBpId ||
        assignedPlantId ||
        shippingWorkLocationId ||
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
        it.priceOverridden ||
        it.deliveryDate ||
        it.notes ||
        it.quantity !== 1 ||
        it.orderType !== "PRODUCTION",
    );

  return (
    <FormShell
      breadcrumbs={[
        tr("common.sales"),
        { label: tr("common.orderAcceptance"), href: BASE_PATH },
        tr("common.createByHand"),
      ]}
      isDirty={isDirty}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={handleSubmit}
      submitLabel={tr("sales.orderAcceptances.createADraft")}
      title={tr("sales.orderAcceptances.createAnOrderAcceptanceByHand")}
    >
      <FormSection
        description={tr(
          "sales.orderAcceptances.createsTheOrderAcceptanceDirectlyWithout",
        )}
        title={tr("common.basicInformation")}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <SearchSelect
            error={customerError}
            f4={customerF4(tr)}
            label={
              <HelpLabel {...fieldHelp(tr, "orderAcceptance", "customer")} />
            }
            onChange={(v) => {
              setCustomerId(v);
              if (v) setCustomerError(null);
            }}
            onSearch={searchCustomerOptions}
            placeholder={tr("common.searchCustomers")}
            storageKey="customer"
            value={customerId}
            withAsterisk
          />
          <SalesRepSelect
            customerBpId={customerId}
            onChange={setSalesRepId}
            value={salesRepId}
          />
          {/* 出荷先は顧客と異なり得る（支店渡しなど）— 通常配送のときだけの欄。
              ユーザー直送の届け先はエンドユーザーなので灰色にする。 */}
          <SearchSelect
            clearable
            description={
              shipToApplies(deliveryMethod)
                ? undefined
                : tr("sales.orderAcceptances.shipToOnlyForNormalDelivery")
            }
            disabled={!shipToApplies(deliveryMethod)}
            label={
              <HelpLabel {...fieldHelp(tr, "orderAcceptance", "shipTo")} />
            }
            onChange={setShipToBpId}
            onSearch={searchShipToOptions}
            placeholder={tr("common.searchShipToOptional")}
            storageKey="ship-to"
            value={shipToBpId}
          />
          {/* 配送方法 — 出荷書は同じ出荷先×配送方法の明細だけを束ねられる。 */}
          <Select
            allowDeselect={false}
            data={acceptanceDeliveryMethodOptions(locale)}
            label={
              <HelpLabel
                {...fieldHelp(tr, "orderAcceptance", "deliveryMethod")}
              />
            }
            onChange={(v) => {
              const next = (v as "NORMAL" | "DIRECT_TO_USER") ?? "NORMAL";
              setDeliveryMethod(next);
              // 直送に切り替えたら出荷先は捨てる（欄が灰色のまま値だけ残ると、
              // 画面に出ていない届け先を持った書類になる）。
              if (!shipToApplies(next)) setShipToBpId(null);
              if (next !== "DIRECT_TO_USER") setEndUserError(null);
            }}
            value={deliveryMethod}
            withAsterisk
          />
          {/* エンドユーザー — 直送では必須、通常配送でも記録用に任意で選べる。 */}
          <SearchSelect
            clearable
            error={endUserError}
            label={
              <HelpLabel {...fieldHelp(tr, "orderAcceptance", "endUser")} />
            }
            onChange={(v) => {
              setEndUserBpId(v);
              if (v) setEndUserError(null);
            }}
            onSearch={searchEndUserOptions}
            placeholder={
              deliveryMethod === "DIRECT_TO_USER"
                ? tr("common.searchEndUsers")
                : tr("common.searchEndUsersOptional")
            }
            storageKey="end-user"
            value={endUserBpId}
            withAsterisk={deliveryMethod === "DIRECT_TO_USER"}
          />
          <Select
            clearable
            data={plantOptions}
            label={
              <HelpLabel
                {...fieldHelp(tr, "orderAcceptance", "assignedPlant")}
              />
            }
            onChange={setAssignedPlantId}
            placeholder={tr("common.selectASiteOptional")}
            searchable
            value={assignedPlantId}
          />
          <Select
            clearable
            data={workLocationOptions}
            label={
              <HelpLabel
                {...fieldHelp(tr, "orderAcceptance", "shippingWorkLocation")}
              />
            }
            onChange={setShippingWorkLocationId}
            placeholder={tr("common.selectAWorkLocationOptional")}
            searchable
            value={shippingWorkLocationId}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp(tr, "orderAcceptance", "customerOrderRef")}
              />
            }
            onChange={(e) => setCustomerOrderRef(e.currentTarget.value)}
            placeholder={tr("common.orderDocumentNumber")}
            value={customerOrderRef}
          />
          {/* 手入力ではなく検索して選ぶ（顧客が決まっていればその顧客の見積だけ）。 */}
          <SearchSelect
            clearable
            label={
              <HelpLabel
                {...fieldHelp(tr, "orderAcceptance", "quoteNumber", {
                  label: tr("common.quoteOptional"),
                })}
              />
            }
            onChange={(v) => setQuoteNumber(v ?? "")}
            onSearch={(q) => searchQuoteOptions(q, customerId)}
            placeholder={
              customerId
                ? tr("common.searchQuotes")
                : tr("common.chooseACustomerFirstToNarrow")
            }
            storageKey="quote"
            value={quoteNumber || null}
          />
          <DatePickerInput
            clearable
            label={
              <HelpLabel {...fieldHelp(tr, "orderAcceptance", "orderDate")} />
            }
            leftSection={<IconCalendar size={14} />}
            onChange={setOrderDate}
            placeholder={tr("common.pickADate")}
            value={orderDate}
            valueFormat="YYYY/MM/DD"
          />
          <TextInput
            label={<HelpLabel {...fieldHelp(tr, "orderAcceptance", "notes")} />}
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder={tr("common.notesOptional")}
            value={notes}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection
        description={tr("sales.orderAcceptances.enterTheProductAndQuantityPer")}
        title={tr("common.lineItems")}
      >
        <OrderAcceptanceItemsEditor
          items={items}
          onChange={setItems}
          priceContext={priceContext}
        />
      </FormSection>
    </FormShell>
  );
}
