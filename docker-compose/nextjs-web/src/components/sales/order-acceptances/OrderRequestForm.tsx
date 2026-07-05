"use client";

/**
 * OrderRequestForm — editable 受注請書 form, fed by the AI extraction (review
 * mode) or empty (manual entry). All fields are editable so the user corrects
 * what the model misread, then confirms. No persistence (DB save out of scope).
 *
 * Dates are free-text inputs: the model returns varied formats (2026/02/16,
 * 2026年2月16日, …) — kept as-is for the user to confirm.
 */

import {
  ActionIcon,
  Box,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Table,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { GhostButton, PrimaryButton } from "@/components/ui/buttons";
import { FormSection } from "@/components/ui/shells";
import { ORDER_TYPE_OPTIONS } from "@/lib/mock";
import { emptyOrderItem, type OrderRequest } from "./types";

const s = (v: string | null) => v ?? "";
const n = (v: number | null): number | "" => (v == null ? "" : v);

function toFormValues(d: OrderRequest) {
  const items = d.items && d.items.length > 0 ? d.items : [emptyOrderItem()];
  return {
    customer_name: s(d.customer_name),
    customer_branch: s(d.customer_branch),
    customer_contact: s(d.customer_contact),
    customer_order_ref: s(d.customer_order_ref),
    order_date: s(d.order_date),
    desired_delivery_date: s(d.desired_delivery_date),
    delivery_location: s(d.delivery_location),
    payment_terms: s(d.payment_terms),
    items: items.map((it) => ({
      product_name: s(it.product_name),
      product_code: s(it.product_code),
      version: s(it.version),
      customization: s(it.customization),
      order_type: s(it.order_type),
      quantity: n(it.quantity),
      unit: s(it.unit),
      unit_price: n(it.unit_price),
      amount: n(it.amount),
      delivery_date: s(it.delivery_date),
      ship_to: s(it.ship_to),
    })),
    subtotal: n(d.subtotal),
    tax_rate: n(d.tax_rate),
    tax_amount: n(d.tax_amount),
    total_amount: n(d.total_amount),
    notes: s(d.notes),
  };
}

export type OrderRequestFormValues = ReturnType<typeof toFormValues>;

const backS = (v: string): string | null => (v.trim() === "" ? null : v.trim());
const backN = (v: number | ""): number | null => (v === "" ? null : v);

/** Form values → OrderRequest (empty strings / "" numbers back to null). */
export function fromFormValues(v: OrderRequestFormValues): OrderRequest {
  return {
    customer_name: backS(v.customer_name),
    customer_branch: backS(v.customer_branch),
    customer_contact: backS(v.customer_contact),
    customer_order_ref: backS(v.customer_order_ref),
    order_date: backS(v.order_date),
    desired_delivery_date: backS(v.desired_delivery_date),
    delivery_location: backS(v.delivery_location),
    payment_terms: backS(v.payment_terms),
    items: v.items.map((it) => ({
      product_name: backS(it.product_name),
      product_code: backS(it.product_code),
      version: backS(it.version),
      customization: backS(it.customization),
      order_type: backS(it.order_type),
      quantity: backN(it.quantity),
      unit: backS(it.unit),
      unit_price: backN(it.unit_price),
      amount: backN(it.amount),
      delivery_date: backS(it.delivery_date),
      ship_to: backS(it.ship_to),
      notes: null,
    })),
    subtotal: backN(v.subtotal),
    tax_rate: backN(v.tax_rate),
    tax_amount: backN(v.tax_amount),
    total_amount: backN(v.total_amount),
    notes: backS(v.notes),
  };
}

export function OrderRequestForm({
  initial,
  onConfirm,
  confirmLabel = "内容を確認",
}: {
  initial: OrderRequest;
  onConfirm: (values: OrderRequestFormValues) => void;
  confirmLabel?: string;
}) {
  const form = useForm<OrderRequestFormValues>({
    initialValues: toFormValues(initial),
  });

  return (
    <Box component="form" onSubmit={form.onSubmit((v) => onConfirm(v))}>
      <FormSection title="基本情報">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="顧客（受注元）"
            withAsterisk
            {...form.getInputProps("customer_name")}
          />
          <TextInput
            label="支店・事業所"
            {...form.getInputProps("customer_branch")}
          />
          <TextInput
            label="先方担当者"
            {...form.getInputProps("customer_contact")}
          />
          <TextInput
            label="顧客注文書番号"
            {...form.getInputProps("customer_order_ref")}
          />
          <TextInput
            label="注文日"
            placeholder="例: 2026-02-16"
            {...form.getInputProps("order_date")}
          />
          <TextInput
            label="希望納期"
            {...form.getInputProps("desired_delivery_date")}
          />
          <TextInput
            label="受渡場所"
            {...form.getInputProps("delivery_location")}
          />
          <TextInput
            label="支払条件"
            {...form.getInputProps("payment_terms")}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection title="明細">
        <Table.ScrollContainer minWidth={1180}>
          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>品名</Table.Th>
                <Table.Th w={120}>品番</Table.Th>
                <Table.Th w={80}>版数</Table.Th>
                <Table.Th w={140}>カスタム</Table.Th>
                <Table.Th w={120}>注文種別</Table.Th>
                <Table.Th w={90}>数量</Table.Th>
                <Table.Th w={70}>単位</Table.Th>
                <Table.Th w={120}>単価</Table.Th>
                <Table.Th w={130}>金額</Table.Th>
                <Table.Th w={120}>納期</Table.Th>
                <Table.Th w={140}>届け先</Table.Th>
                <Table.Th w={44} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {form.values.items.map((_it, i) => (
                <Table.Tr key={form.key(`items.${i}`)}>
                  <Table.Td>
                    <TextInput
                      {...form.getInputProps(`items.${i}.product_name`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      {...form.getInputProps(`items.${i}.product_code`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput {...form.getInputProps(`items.${i}.version`)} />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      placeholder="追加加工等"
                      {...form.getInputProps(`items.${i}.customization`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      clearable
                      data={ORDER_TYPE_OPTIONS}
                      {...form.getInputProps(`items.${i}.order_type`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      {...form.getInputProps(`items.${i}.quantity`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput {...form.getInputProps(`items.${i}.unit`)} />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      prefix="¥"
                      thousandSeparator=","
                      {...form.getInputProps(`items.${i}.unit_price`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      prefix="¥"
                      thousandSeparator=","
                      {...form.getInputProps(`items.${i}.amount`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      {...form.getInputProps(`items.${i}.delivery_date`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      placeholder="直送先"
                      {...form.getInputProps(`items.${i}.ship_to`)}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      aria-label="明細を削除"
                      color="red"
                      disabled={form.values.items.length <= 1}
                      onClick={() => form.removeListItem("items", i)}
                      variant="subtle"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <GhostButton
          leftSection={<IconPlus size={16} />}
          mt="sm"
          onClick={() => form.insertListItem("items", { ...emptyToForm() })}
          size="xs"
        >
          明細を追加
        </GhostButton>

        <SimpleGrid cols={{ base: 1, sm: 4 }} mt="md" spacing="sm">
          <NumberInput
            label="小計"
            prefix="¥"
            thousandSeparator=","
            {...form.getInputProps("subtotal")}
          />
          <NumberInput
            label="税率"
            suffix="%"
            {...form.getInputProps("tax_rate")}
          />
          <NumberInput
            label="消費税"
            prefix="¥"
            thousandSeparator=","
            {...form.getInputProps("tax_amount")}
          />
          <NumberInput
            label="合計金額"
            prefix="¥"
            thousandSeparator=","
            {...form.getInputProps("total_amount")}
          />
        </SimpleGrid>
      </FormSection>

      <Textarea
        autosize
        label="備考"
        minRows={2}
        {...form.getInputProps("notes")}
      />

      <Group justify="flex-end" mt="md">
        <PrimaryButton type="submit">{confirmLabel}</PrimaryButton>
      </Group>
    </Box>
  );
}

/** A blank item in the form's value shape (numbers as ""). */
function emptyToForm() {
  return {
    product_name: "",
    product_code: "",
    version: "",
    customization: "",
    order_type: "",
    quantity: "" as number | "",
    unit: "",
    unit_price: "" as number | "",
    amount: "" as number | "",
    delivery_date: "",
    ship_to: "",
  };
}
