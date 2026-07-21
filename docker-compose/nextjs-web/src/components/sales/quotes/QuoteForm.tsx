"use client";

/**
 * QuoteForm — 見積書 新規作成 / 編集 (design.md §8.3).
 *
 * 顧客 + 有効期限 + 状態, then a line-item section where each row is a
 * ProductPriceResolverInput (§12.9) that auto-fills 単価 from the 価格表 for the
 * chosen 顧客×製品×注文種別×数量. Changing 顧客 re-resolves every line
 * against the server-fetched 価格表 entries; the Server Action re-resolves
 * once more at save time (the client values are display-only).
 */

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import {
  createQuote,
  updateQuote,
} from "@/app/(dashboard)/sales/quotes/actions";
import {
  ProductPriceResolverInput,
  type ResolverValue,
} from "@/components/sales/ProductPriceResolverInput";
import { GhostButton } from "@/components/ui/buttons";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { zodResolver } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type { Option } from "@/lib/mock";
import type { PriceListEntry } from "../price-lists/model";
import { type Quote, resolveUnitPriceFromEntries, TAX_RATE } from "./model";

const itemSchema = z
  .object({
    productId: z.string().min(1, "製品を選択してください"),
    productName: z.string(),
    orderType: z.string().min(1),
    quantity: z.number().int().min(1, "1以上"),
    // 単価・値引きは価格表から自動解決される（手入力なし）。
    unitPrice: z.number().min(0),
    priceTierId: z.string().nullable(),
    discountAmount: z.number().min(0),
    discountLabel: z.string().nullable(),
    deliveryDate: z.string().nullable(),
  })
  // 見積書は価格表からのみ価格を解決する — 未解決の行は保存できない。
  .refine((it) => it.priceTierId != null, {
    message: "該当する価格表がありません（試算から価格表を登録してください）",
    path: ["productId"],
  });

const schema = z.object({
  customerId: z.string().min(1, "顧客を選択してください"),
  customerBranchId: z.string().nullable(),
  status: z.enum(["DRAFT", "ISSUED", "ACCEPTED", "REJECTED", "EXPIRED"]),
  validUntil: z.string().nullable(),
  notes: z.string(),
  items: z.array(itemSchema).min(1, "明細を1件以上追加してください"),
});

type QuoteFormValues = z.infer<typeof schema>;
type ItemForm = QuoteFormValues["items"][number];

const BASE_PATH = "/sales/quotes";

const emptyItem = (): ItemForm => ({
  productId: "",
  productName: "",
  orderType: "PRODUCTION",
  quantity: 1,
  unitPrice: 0,
  priceTierId: null,
  discountAmount: 0,
  discountLabel: null,
  deliveryDate: null,
});

/** 価格表「見積書を作成」からの事前入力（quotes/new?customer=…&product=…）. */
export interface QuotePrefill {
  customerId?: string;
  productId?: string;
  orderType?: string;
  quantity?: number;
  deliveryDate?: string | null;
}

function buildInitial(
  quote: Quote | null | undefined,
  prefill: QuotePrefill | undefined,
  entries: PriceListEntry[],
): QuoteFormValues {
  if (quote) return toFormValues(quote);
  const base: QuoteFormValues = {
    customerId: prefill?.customerId ?? "",
    customerBranchId: null,
    status: "DRAFT",
    validUntil: null,
    notes: "",
    items: [emptyItem()],
  };
  if (prefill?.customerId && prefill.productId) {
    // 価格表から起動 — 単価・値引きを価格表から解決して1行目に流し込む。
    const orderType = prefill.orderType ?? "PRODUCTION";
    const quantity = prefill.quantity ?? 1;
    const resolved = resolveUnitPriceFromEntries(
      entries,
      prefill.customerId,
      prefill.productId,
      orderType,
      quantity,
    );
    base.items = [
      {
        ...emptyItem(),
        productId: prefill.productId,
        productName:
          entries.find((e) => e.productId === prefill.productId)?.productName ??
          prefill.productId,
        orderType,
        quantity,
        unitPrice: resolved?.unitPrice ?? 0,
        priceTierId: resolved?.tierId ?? null,
        discountAmount: resolved?.discountAmount ?? 0,
        discountLabel: resolved?.discountLabel ?? null,
        deliveryDate: prefill.deliveryDate ?? null,
      },
    ];
  }
  return base;
}

function toFormValues(q: Quote): QuoteFormValues {
  return {
    customerId: q.customerId,
    customerBranchId: q.customerBranchId,
    status: q.status,
    validUntil: q.validUntil,
    notes: q.notes ?? "",
    items: q.items.map((it) => ({
      productId: it.productId,
      productName: it.productName,
      orderType: it.orderType,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      priceTierId: it.priceTierId,
      discountAmount: it.discountAmount,
      discountLabel: it.discountLabel,
      deliveryDate: it.deliveryDate,
    })),
  };
}

export function QuoteForm({
  mode,
  quote,
  prefill,
  customerOptions,
  branchesByCustomer,
  entries,
}: {
  mode: "create" | "edit";
  /** Edit / 複製: the source quote (server-fetched view-model). */
  quote?: Quote | null;
  prefill?: QuotePrefill;
  customerOptions: Option[];
  /** 顧客 BP id → 支店 options. */
  branchesByCustomer: Record<string, Option[]>;
  /** 全顧客の価格表エントリ — 行のライブ解決に使用。 */
  entries: PriceListEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const quoteId = mode === "edit" ? quote?.id : undefined;

  const form = useForm<QuoteFormValues>({
    validate: zodResolver(schema),
    initialValues: buildInitial(quote, prefill, entries),
  });

  const branches = branchesByCustomer[form.values.customerId] ?? [];

  /** Changing 顧客 → re-resolve every line's 単価・値引き against the new customer's 価格表. */
  const onCustomerChange = (customerId: string) => {
    form.setFieldValue("customerId", customerId);
    form.setFieldValue("customerBranchId", null);
    form.setFieldValue(
      "items",
      form.values.items.map((it) => {
        const r = it.productId
          ? resolveUnitPriceFromEntries(
              entries,
              customerId,
              it.productId,
              it.orderType,
              it.quantity,
            )
          : null;
        return {
          ...it,
          unitPrice: r?.unitPrice ?? 0,
          priceTierId: r?.tierId ?? null,
          discountAmount: r?.discountAmount ?? 0,
          discountLabel: r?.discountLabel ?? null,
        };
      }),
    );
  };

  const subtotal = form.values.items.reduce(
    (sum, it) =>
      sum + Math.max(0, it.unitPrice * it.quantity - it.discountAmount),
    0,
  );
  const tax = Math.round(subtotal * TAX_RATE);
  const grandTotal = subtotal + tax;

  const handleSubmit = (values: QuoteFormValues) => {
    const payload = {
      customerBpId: values.customerId,
      customerBranchBpId: values.customerBranchId,
      status: values.status,
      validUntil: values.validUntil,
      notes: values.notes,
      items: values.items.map((it) => ({
        productId: it.productId,
        orderType: it.orderType as "PRODUCTION" | "TEST" | "SAMPLE" | "OTHER",
        quantity: it.quantity,
        deliveryDate: it.deliveryDate,
        notes: null,
      })),
    };
    startTransition(async () => {
      const result =
        mode === "edit" && quoteId
          ? await updateQuote(quoteId, payload)
          : await createQuote(payload);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message:
            mode === "edit" ? "見積書を更新しました" : "見積書を作成しました",
          color: "green",
        });
        // 作成・更新後は詳細（ビュー）ページへ。
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
        { label: "見積書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(quoteId ? `${BASE_PATH}/${quoteId}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={
        mode === "edit" ? (
          <StatusBadge entity="Quote" status={form.values.status} />
        ) : undefined
      }
      title={mode === "edit" ? "見積書 編集" : "見積書 新規作成"}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            data={customerOptions}
            error={form.errors.customerId}
            label="顧客"
            onChange={(v) => onCustomerChange(v ?? "")}
            placeholder="顧客を選択"
            searchable
            value={form.values.customerId || null}
            withAsterisk
          />
          <Select
            clearable
            data={branches}
            disabled={branches.length === 0}
            label="支店"
            placeholder={branches.length ? "支店を選択" : "支店なし"}
            {...form.getInputProps("customerBranchId")}
          />
          <DatePickerInput
            clearable
            label="有効期限"
            leftSection={<IconCalendar size={14} />}
            placeholder="日付を選択"
            valueFormat="YYYY/MM/DD"
            {...form.getInputProps("validUntil")}
          />
          <Select
            data={statusOptions("Quote")}
            label="状態"
            {...form.getInputProps("status")}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection
        description="単価（基準単価 × 数量倍率）と値引き（値引きルール）は顧客の価格表から自動計算されます。手入力はありません — 価格を変える場合は価格表側で設定してください。"
        title="明細"
      >
        <Stack gap="md">
          {form.values.items.map((item, ri) => (
            <Box key={form.key(`items.${ri}`)}>
              {ri > 0 && <Divider mb="md" />}
              <Group align="flex-end" gap="sm" wrap="nowrap">
                <Box flex={1}>
                  <ProductPriceResolverInput
                    customerId={form.values.customerId}
                    entries={entries}
                    onChange={(next: ResolverValue) => {
                      form.setFieldValue(
                        `items.${ri}.productId`,
                        next.productId,
                      );
                      form.setFieldValue(
                        `items.${ri}.productName`,
                        next.productName,
                      );
                      form.setFieldValue(
                        `items.${ri}.orderType`,
                        next.orderType,
                      );
                      form.setFieldValue(`items.${ri}.quantity`, next.quantity);
                      form.setFieldValue(
                        `items.${ri}.unitPrice`,
                        next.unitPrice,
                      );
                      form.setFieldValue(
                        `items.${ri}.priceTierId`,
                        next.priceTierId,
                      );
                      form.setFieldValue(
                        `items.${ri}.discountAmount`,
                        next.discountAmount,
                      );
                      form.setFieldValue(
                        `items.${ri}.discountLabel`,
                        next.discountLabel,
                      );
                    }}
                    value={item}
                  />
                </Box>
                <ActionIcon
                  aria-label="明細を削除"
                  color="red"
                  disabled={form.values.items.length <= 1}
                  mb={4}
                  onClick={() => form.removeListItem("items", ri)}
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
              <DatePickerInput
                clearable
                label="納期"
                leftSection={<IconCalendar size={14} />}
                maw={220}
                mt="xs"
                placeholder="日付を選択"
                valueFormat="YYYY/MM/DD"
                {...form.getInputProps(`items.${ri}.deliveryDate`)}
              />
            </Box>
          ))}
        </Stack>

        {typeof form.errors.items === "string" && (
          <Text c="red" mt="xs" size="xs">
            {form.errors.items}
          </Text>
        )}

        <GhostButton
          leftSection={<IconPlus size={16} />}
          mt="md"
          onClick={() => form.insertListItem("items", emptyItem())}
          size="xs"
        >
          明細を追加
        </GhostButton>

        <Divider my="md" />
        <Group gap="xl" justify="flex-end">
          <Text c="dimmed" size="sm">
            小計 {formatMoney(subtotal)}
          </Text>
          <Text c="dimmed" size="sm">
            消費税 {formatMoney(tax)}
          </Text>
          <Text fw={700}>合計（税込） {formatMoney(grandTotal)}</Text>
        </Group>
      </FormSection>

      <Textarea
        autosize
        label="備考"
        minRows={2}
        {...form.getInputProps("notes")}
      />
    </FormShell>
  );
}
