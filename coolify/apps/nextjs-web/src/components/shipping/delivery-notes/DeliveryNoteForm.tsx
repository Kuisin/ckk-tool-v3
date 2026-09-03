"use client";

/**
 * DeliveryNoteForm — 納品書 編集 (SH02, design.md §8.3).
 *
 * 納品書は出荷書の確定時に自動作成される（1 通、ユーザー直送は 2 通 —
 * confirmDeliveryOrder / lib 側 planAutoDeliveryNotes）。この画面は
 * **下書きの編集専用**（手動作成の口は無い — ガードはサーバー側でも実施）。
 * 出荷書・納品先は変更不可。納品方法・最終需要家・価格記載・明細は編集できる。
 */

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  Input,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import { searchProductOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  searchEndUserOptions,
  updateDeliveryNote,
} from "@/app/(dashboard)/shipping/delivery-notes/actions";
import { GhostButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { productF4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SalesRepSelect } from "@/components/ui/SalesRepSelect";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { deliveryMethodLabel } from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type { DeliveryMethod, DeliveryNote } from "./model";

const BASE_PATH = "/shipping/delivery-notes";

const DELIVERY_METHODS = ["NORMAL", "DIRECT_TO_USER"] as const;

function buildSchema(tr: ReturnType<typeof useTranslations>) {
  const itemSchema = z.object({
    rowId: z.string(),
    productId: z
      .string()
      .min(1, tr("shipping.deliveryOrderForm.selectProduct")),
    productName: z.string(),
    quantity: z.number().int().min(1, tr("common.mustBeAtLeastOne")),
    unitPrice: z.number().min(0, tr("common.mustBeZeroOrMore")),
    notes: z.string(),
  });

  return z
    .object({
      salesRepId: z.string().nullable(),
      deliveryMethod: z.enum(DELIVERY_METHODS),
      endUserBpId: z.string().nullable(),
      includePrice: z.boolean(),
      notes: z.string(),
      items: z.array(itemSchema).min(1, tr("common.addAtLeastOneLineItem")),
    })
    .superRefine((v, ctx) => {
      // ユーザー直送は届け先（最終需要家）が必須。
      if (v.deliveryMethod === "DIRECT_TO_USER" && !v.endUserBpId) {
        ctx.addIssue({
          code: "custom",
          path: ["endUserBpId"],
          message: tr("shipping.deliveryNotes.selectAnEndUser"),
        });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;
type ItemForm = FormValues["items"][number];

let rowSeq = 0;
const newRowId = () => `row-${++rowSeq}-${Date.now()}`;

const emptyItem = (
  productId = "",
  productName = "",
  quantity = 1,
  unitPrice = 0,
): ItemForm => ({
  rowId: newRowId(),
  productId,
  productName,
  quantity,
  unitPrice,
  notes: "",
});

function toFormValues(note: DeliveryNote): FormValues {
  return {
    salesRepId: note.salesRepId,
    deliveryMethod: note.deliveryMethod,
    endUserBpId: note.endUserId,
    includePrice: note.includePrice,
    notes: note.notes ?? "",
    items: note.items.map((it) => ({
      rowId: newRowId(),
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice ?? 0,
      notes: it.notes ?? "",
    })),
  };
}

export function DeliveryNoteForm({ note }: { note: DeliveryNote }) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const schema = buildSchema(tr);

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: toFormValues(note),
  });

  // 納品先 = 注文明細の顧客（+支店）。作成後変更不可。
  const recipientLabel = note.recipientBranchName
    ? `${note.recipientName} / ${note.recipientBranchName}`
    : note.recipientName;

  // 最終需要家の初期ラベル（SearchSelect の initialOption 用）。
  const endUserInitialOption =
    form.values.endUserBpId &&
    note.endUserId === form.values.endUserBpId &&
    note.endUserName
      ? { value: form.values.endUserBpId, label: note.endUserName }
      : null;

  /** 納品方法変更 → 価格記載の既定を切替（通常=ON / 直送=OFF）。 */
  const onMethodChange = (method: DeliveryMethod) => {
    form.setValues((prev) => ({
      ...prev,
      deliveryMethod: method,
      includePrice: method === "NORMAL",
    }));
  };

  const totalQuantity = form.values.items.reduce(
    (sum, it) => sum + it.quantity,
    0,
  );
  const totalAmount = form.values.items.reduce(
    (sum, it) => sum + it.unitPrice * it.quantity,
    0,
  );

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const payload = {
        salesRepId: values.salesRepId,
        deliveryMethod: values.deliveryMethod,
        endUserBpId:
          values.deliveryMethod === "DIRECT_TO_USER"
            ? values.endUserBpId
            : null,
        includePrice: values.includePrice,
        notes: values.notes || null,
        items: values.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          // 価格記載なしのときは単価を送らない（サーバー側でも null 化）。
          unitPrice: values.includePrice ? it.unitPrice : null,
          notes: it.notes || null,
        })),
      };
      const result = await updateDeliveryNote(note.id, payload);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("shipping.deliveryNotes.theDeliveryNoteWasUpdated"),
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

  return (
    <FormShell
      breadcrumbs={[
        tr("common.shipping"),
        { label: tr("common.deliveryNote"), href: BASE_PATH },
        tr("common.edit"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() => router.push(`${BASE_PATH}/${note.id}`)}
      onSubmit={form.onSubmit(handleSubmit)}
      status={<StatusBadge entity="DeliveryNote" status={note.status} />}
      title={tr("shipping.deliveryNoteForm.editWithNumber", {
        noteId: note.id,
      })}
    >
      <FormSection title={tr("common.basicInformation")}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <FieldValue
            label={tr("common.deliveryOrder")}
            value={note.deliveryOrderNumber}
          />
          <Input.Wrapper
            label={
              <HelpLabel {...fieldHelp(tr, "deliveryNote", "deliveryMethod")} />
            }
            withAsterisk
          >
            <SegmentedControl
              data={DELIVERY_METHODS.map((m) => ({
                value: m,
                label: deliveryMethodLabel(m, locale) ?? m,
              }))}
              fullWidth
              onChange={(v) => onMethodChange(v as DeliveryMethod)}
              value={form.values.deliveryMethod}
            />
          </Input.Wrapper>
          {/* 納品先 = 注文明細の顧客（+支店）。作成後変更不可。 */}
          <FieldValue label={tr("common.shipTo")} value={recipientLabel} />
          <SalesRepSelect
            customerBpId={note.recipientId}
            initial={
              note.salesRepId && note.salesRepName
                ? { id: note.salesRepId, name: note.salesRepName }
                : null
            }
            onChange={(v) => form.setFieldValue("salesRepId", v)}
            value={form.values.salesRepId}
          />
          {form.values.deliveryMethod === "DIRECT_TO_USER" && (
            <SearchSelect
              description={tr("shipping.deliveryNotes.shipToForDirectToUser")}
              error={form.errors.endUserBpId}
              initialOption={endUserInitialOption}
              label={
                <HelpLabel {...fieldHelp(tr, "deliveryNote", "endUser")} />
              }
              onChange={(v) => form.setFieldValue("endUserBpId", v)}
              onSearch={searchEndUserOptions}
              placeholder={tr("shipping.deliveryNotes.searchEndUsers")}
              storageKey="end-user"
              value={form.values.endUserBpId}
              withAsterisk
            />
          )}
          <Switch
            checked={form.values.includePrice}
            label={
              <HelpLabel
                {...fieldHelp(tr, "deliveryNote", "includePrice", {
                  label: tr(
                    "shipping.deliveryNotes.showPricesPrintUnitPriceAnd",
                  ),
                })}
              />
            }
            mt="xs"
            onChange={(e) =>
              form.setFieldValue("includePrice", e.currentTarget.checked)
            }
          />
          <Textarea
            autosize
            label={<HelpLabel {...fieldHelp(tr, "deliveryNote", "notes")} />}
            minRows={1}
            placeholder={tr("common.notesOptional")}
            {...form.getInputProps("notes")}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection title={tr("common.lineItems")}>
        <Group justify="flex-end" mb="xs">
          {typeof form.errors.items === "string" && (
            <Text c="red" size="xs">
              {form.errors.items}
            </Text>
          )}
        </Group>
        {form.values.items.map((item, ri) => (
          <Box key={item.rowId}>
            {ri > 0 && <Divider my="md" />}
            <Group align="flex-end" gap="sm" wrap="nowrap">
              <Box flex={1}>
                <Group
                  align="flex-end"
                  gap="sm"
                  grow
                  preventGrowOverflow={false}
                >
                  <SearchSelect
                    error={form.errors[`items.${ri}.productId`]}
                    f4={productF4(tr)}
                    initialOption={
                      item.productId
                        ? { value: item.productId, label: item.productName }
                        : null
                    }
                    label={
                      <HelpLabel
                        {...fieldHelp(tr, "deliveryNote", "product")}
                      />
                    }
                    onChange={(v, opt) =>
                      form.setFieldValue(`items.${ri}`, {
                        ...item,
                        productId: v ?? "",
                        productName: opt?.label ?? "",
                      })
                    }
                    onSearch={searchProductOptions}
                    placeholder={tr("common.searchProducts")}
                    storageKey="product"
                    value={item.productId || null}
                    withAsterisk
                  />
                  <NumberInput
                    error={form.errors[`items.${ri}.quantity`]}
                    label={
                      <HelpLabel
                        {...fieldHelp(tr, "deliveryNote", "quantity")}
                      />
                    }
                    maw={110}
                    min={1}
                    onChange={(v) =>
                      form.setFieldValue(
                        `items.${ri}.quantity`,
                        typeof v === "number" ? v : 0,
                      )
                    }
                    value={item.quantity}
                    withAsterisk
                  />
                  <NumberInput
                    decimalScale={2}
                    disabled={!form.values.includePrice}
                    error={form.errors[`items.${ri}.unitPrice`]}
                    label={
                      <HelpLabel
                        {...fieldHelp(tr, "deliveryNote", "unitPrice")}
                      />
                    }
                    maw={160}
                    min={0}
                    onChange={(v) =>
                      form.setFieldValue(
                        `items.${ri}.unitPrice`,
                        typeof v === "number" ? v : 0,
                      )
                    }
                    prefix="¥"
                    thousandSeparator=","
                    value={item.unitPrice}
                  />
                  <TextInput
                    label={
                      <HelpLabel {...fieldHelp(tr, "deliveryNote", "notes")} />
                    }
                    placeholder={tr("common.lineNotesOptional")}
                    {...form.getInputProps(`items.${ri}.notes`)}
                  />
                </Group>
              </Box>
              <Text
                className="tabular-nums"
                ff="mono"
                fw={600}
                mb={8}
                size="sm"
                w={110}
              >
                {form.values.includePrice
                  ? formatMoney(item.unitPrice * item.quantity)
                  : "—"}
              </Text>
              <ActionIcon
                aria-label={tr("common.removeLine")}
                color="red"
                disabled={form.values.items.length <= 1}
                mb={4}
                onClick={() => form.removeListItem("items", ri)}
                variant="subtle"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Box>
        ))}

        <GhostButton
          leftSection={<IconPlus size={16} />}
          mt="md"
          onClick={() => form.insertListItem("items", emptyItem())}
          size="xs"
        >
          {tr("common.addLine")}
        </GhostButton>

        <Divider my="md" />
        <Group gap="xl" justify="flex-end">
          <Text fw={700}>
            {tr("common.totalQuantity")} {totalQuantity}
          </Text>
          {form.values.includePrice && (
            <Text fw={700}>
              {tr("common.totalAmount")} {formatMoney(totalAmount)}
            </Text>
          )}
        </Group>
      </FormSection>
    </FormShell>
  );
}
