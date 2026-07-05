"use client";

/**
 * QuoteForm — 見積書 新規作成 / 編集 (design.md §8.3).
 *
 * 顧客 + 有効期限 + 状態, then a line-item section where each row is a
 * ProductPriceResolverInput (§12.9) that auto-fills 単価 from the 価格表 for the
 * chosen 顧客×製品×注文種別×数量. Changing 顧客 re-resolves every line.
 *
 * TODO(server-action): replace the console.log submit with a Server Action.
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
  ProductPriceResolverInput,
  type ResolverValue,
} from "@/components/sales/ProductPriceResolverInput";
import { GhostButton } from "@/components/ui/buttons";
import { StatusBadge, statusOptions } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { zodResolver } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import { BRANCHES, CUSTOMERS, PRODUCTS } from "@/lib/mock";
import { getQuote, type Quote, resolveUnitPrice, TAX_RATE } from "./mock";

const itemSchema = z
  .object({
    productId: z.string().min(1, "製品を選択してください"),
    productName: z.string(),
    orderType: z.string().min(1),
    quantity: z.number().int().min(1, "1以上"),
    unitPrice: z.number().min(0),
    priceTierId: z.string().nullable(),
    discountAmount: z.number().min(0),
    deliveryDate: z.string().nullable(),
  })
  .refine((it) => it.unitPrice * it.quantity - it.discountAmount >= 0, {
    message: "値引き額が金額を超えています",
    path: ["discountAmount"],
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
  deliveryDate: null,
});

/** 価格表「見積書を作成」からの事前入力（quotes/new?customer=…&product=…）. */
export interface QuotePrefill {
  customerId?: string;
  productId?: string;
  orderType?: string;
  quantity?: number;
  discountAmount?: number;
  deliveryDate?: string | null;
}

function buildInitial(
  mode: "create" | "edit",
  quoteId?: string,
  prefill?: QuotePrefill,
): QuoteFormValues {
  if (mode === "edit" && quoteId) {
    const q = getQuote(quoteId);
    if (q) return toFormValues(q);
  }
  const base: QuoteFormValues = {
    customerId: prefill?.customerId ?? "",
    customerBranchId: null,
    status: "DRAFT",
    validUntil: null,
    notes: "",
    items: [emptyItem()],
  };
  if (prefill?.customerId && prefill.productId) {
    // 価格表から起動 — 単価は価格表 tier から解決して1行目に流し込む。
    const orderType = prefill.orderType ?? "PRODUCTION";
    const quantity = prefill.quantity ?? 1;
    const resolved = resolveUnitPrice(
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
          PRODUCTS.find((p) => p.value === prefill.productId)?.label ??
          prefill.productId,
        orderType,
        quantity,
        unitPrice: resolved?.unitPrice ?? 0,
        priceTierId: resolved?.tierId ?? null,
        discountAmount: prefill.discountAmount ?? 0,
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
      deliveryDate: it.deliveryDate,
    })),
  };
}

export function QuoteForm({
  mode,
  quoteId,
  prefill,
}: {
  mode: "create" | "edit";
  quoteId?: string;
  prefill?: QuotePrefill;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<QuoteFormValues>({
    validate: zodResolver(schema),
    initialValues: buildInitial(mode, quoteId, prefill),
  });

  const branches = BRANCHES[form.values.customerId] ?? [];

  /** Changing 顧客 → re-resolve every line's 単価 against the new customer's 価格表. */
  const onCustomerChange = (customerId: string) => {
    form.setFieldValue("customerId", customerId);
    form.setFieldValue("customerBranchId", null);
    form.setFieldValue(
      "items",
      form.values.items.map((it) => {
        const r = it.productId
          ? resolveUnitPrice(
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
    startTransition(() => {
      // TODO(server-action): persist quote + items (採番 QOT-YYYYMM-NNNNN on create).
      console.log("submit quote", values);
      notifications.show({
        title: "保存しました",
        message:
          mode === "edit" ? "見積書を更新しました" : "見積書を作成しました",
        color: "green",
      });
      // 作成・更新後は詳細（ビュー）ページへ。create は既存デモ ID にフォールバック。
      const targetId =
        mode === "edit" && quoteId ? quoteId : "QOT-202602-00012";
      router.push(`${BASE_PATH}/${targetId}`);
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        "販売",
        { label: "見積書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
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
            data={CUSTOMERS}
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
        description="製品・注文種別・数量を選ぶと、顧客の価格表から単価が自動入力されます（手動上書き可）。値引きは必要時のみ入力してください。"
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
