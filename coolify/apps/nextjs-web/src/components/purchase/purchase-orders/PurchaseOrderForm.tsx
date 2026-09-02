"use client";

/**
 * PurchaseOrderForm — 素材発注書 新規作成 / 編集 (PU02, design.md §8.3)。
 *
 * ヘッダ（仕入先 Select（VENDOR ロール BP）/ 発注日 / 備考）+ 明細 1..N 行
 * （素材 SearchSelect / 入荷先拠点 Select / 数量 + 単位 / 単価 / 金額自動 /
 * 入荷予定日 / 備考）。金額・合計はサーバー側で再計算する（表示は参考値）。
 *
 * 編集は DRAFT のみ（サーバー側でもガード）。保存後は詳細ページへ遷移する。
 */

import {
  ActionIcon,
  Box,
  Divider,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import { searchMaterialOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
} from "@/app/(dashboard)/purchase/purchase-orders/actions";
import { GhostButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { unitOptions } from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type { PurchaseOrderView } from "./model";

const BASE_PATH = "/purchase/purchase-orders";

interface Option {
  value: string;
  label: string;
}

function buildSchema(tr: ReturnType<typeof useTranslations>) {
  const itemSchema = z.object({
    rowId: z.string(),
    materialId: z
      .string()
      .min(1, tr("purchase.purchaseOrderForm.selectMaterial")),
    materialLabel: z.string(),
    plantId: z.string().nullable(),
    quantity: z.number().positive(tr("common.mustBeGreaterThanZero")),
    unit: z.string().min(1, tr("common.required")),
    unitPrice: z.number().min(0, tr("common.mustBeZeroOrMore")),
    expectedAt: z.string().nullable(),
    notes: z.string(),
  });

  return z.object({
    supplierBpId: z
      .string()
      .min(1, tr("purchase.purchaseRequests.selectASupplier")),
    purchaseDate: z.string().nullable(),
    notes: z.string(),
    items: z.array(itemSchema).min(1, tr("common.addAtLeastOneLineItem")),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;
type ItemForm = FormValues["items"][number];

let rowSeq = 0;
const newRowId = () => `row-${++rowSeq}-${Date.now()}`;

const emptyItem = (): ItemForm => ({
  rowId: newRowId(),
  materialId: "",
  materialLabel: "",
  plantId: null,
  quantity: 1,
  unit: "本",
  unitPrice: 0,
  expectedAt: null,
  notes: "",
});

function toFormValues(po: PurchaseOrderView): FormValues {
  return {
    supplierBpId: po.supplierBpId,
    purchaseDate: po.purchaseDate,
    notes: po.notes ?? "",
    items: po.items.map((it) => ({
      rowId: newRowId(),
      materialId: it.materialId,
      materialLabel: `${it.materialCode}（${it.materialName}）`,
      plantId: it.plantId,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      expectedAt: it.expectedAt,
      notes: it.notes ?? "",
    })),
  };
}

export function PurchaseOrderForm({
  mode,
  purchaseOrder,
  supplierOptions,
  plantOptions,
}: {
  mode: "create" | "edit";
  /** 編集時: 対象発注書（サーバー取得の view-model）。 */
  purchaseOrder?: PurchaseOrderView | null;
  /** 仕入先（VENDOR ロールの有効 BP）。value = uuid。 */
  supplierOptions: Option[];
  /** 入荷先拠点（有効のみ）。value = String(内部 id)。 */
  plantOptions: Option[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const poNumber = mode === "edit" ? purchaseOrder?.poNumber : undefined;
  const schema = buildSchema(tr);

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues:
      mode === "edit" && purchaseOrder
        ? toFormValues(purchaseOrder)
        : {
            supplierBpId: "",
            purchaseDate: null,
            notes: "",
            items: [emptyItem()],
          },
  });

  const total = form.values.items.reduce(
    (sum, it) => sum + it.quantity * it.unitPrice,
    0,
  );

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const payload = {
        supplierBpId: values.supplierBpId,
        purchaseDate: values.purchaseDate,
        notes: values.notes,
        items: values.items.map((it) => ({
          materialId: it.materialId,
          plantId: it.plantId,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          expectedAt: it.expectedAt,
          notes: it.notes || null,
        })),
      };
      const result =
        mode === "edit" && poNumber
          ? await updatePurchaseOrder(poNumber, payload)
          : await createPurchaseOrder(payload);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message:
            mode === "edit"
              ? tr("purchase.purchaseOrderForm.updatedWithNumber", {
                  poNumber: result.data.poNumber,
                })
              : tr("purchase.purchaseOrderForm.createdWithNumber", {
                  poNumber: result.data.poNumber,
                }),
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.poNumber}`);
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
        tr("common.purchasing"),
        { label: tr("common.materialPurchaseOrder"), href: BASE_PATH },
        mode === "edit" ? tr("common.edit") : tr("common.new2"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(poNumber ? `${BASE_PATH}/${poNumber}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={
        mode === "edit" && purchaseOrder ? (
          <StatusBadge
            entity="MaterialPurchaseOrder"
            status={purchaseOrder.status}
          />
        ) : undefined
      }
      title={
        mode === "edit"
          ? tr("purchase.purchaseOrderForm.editWithNumber", {
              poNumber: poNumber ?? "",
            })
          : tr("purchase.purchaseOrders.newMaterialPurchaseOrder")
      }
    >
      <FormSection title={tr("common.basicInformation")}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            clearable
            data={supplierOptions}
            label={<HelpLabel {...fieldHelp("purchaseOrder", "supplier")} />}
            placeholder={tr("common.selectASupplier")}
            searchable
            withAsterisk
            {...form.getInputProps("supplierBpId")}
          />
          <DatePickerInput
            clearable
            description={tr("purchase.purchaseOrders.ifLeftBlankItIsSet")}
            label={<HelpLabel {...fieldHelp("purchaseOrder", "orderDate")} />}
            leftSection={<IconCalendar size={14} />}
            placeholder={tr("common.pickADate")}
            valueFormat="YYYY/MM/DD"
            {...form.getInputProps("purchaseDate")}
          />
        </SimpleGrid>
        <Textarea
          autosize
          label={tr("common.notes")}
          minRows={2}
          mt="sm"
          placeholder={tr("common.notesOptional")}
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection
        description={tr(
          "purchase.purchaseOrders.theAmountIsComputedServerSide",
        )}
        title={tr("common.lineItems")}
      >
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
                    error={form.errors[`items.${ri}.materialId`]}
                    initialOption={
                      item.materialId
                        ? { value: item.materialId, label: item.materialLabel }
                        : null
                    }
                    label={tr("common.materials")}
                    onChange={(v, opt) => {
                      form.setFieldValue(`items.${ri}.materialId`, v ?? "");
                      form.setFieldValue(
                        `items.${ri}.materialLabel`,
                        opt?.label ?? "",
                      );
                    }}
                    onSearch={searchMaterialOptions}
                    placeholder={tr("common.searchMaterials")}
                    storageKey="material"
                    value={item.materialId || null}
                    withAsterisk
                  />
                  <Select
                    clearable
                    data={plantOptions}
                    label={
                      <HelpLabel {...fieldHelp("purchaseOrder", "plant")} />
                    }
                    maw={180}
                    placeholder={tr("common.selectASite")}
                    {...form.getInputProps(`items.${ri}.plantId`)}
                  />
                  <NumberInput
                    decimalScale={3}
                    error={form.errors[`items.${ri}.quantity`]}
                    label={tr("common.quantity")}
                    maw={110}
                    min={0}
                    {...form.getInputProps(`items.${ri}.quantity`)}
                    withAsterisk
                  />
                  <Select
                    data={unitOptions(locale)}
                    label={tr("common.unit")}
                    maw={90}
                    withAsterisk
                    {...form.getInputProps(`items.${ri}.unit`)}
                  />
                  <NumberInput
                    decimalScale={2}
                    error={form.errors[`items.${ri}.unitPrice`]}
                    label={
                      <HelpLabel {...fieldHelp("purchaseOrder", "unitPrice")} />
                    }
                    maw={150}
                    min={0}
                    prefix="¥"
                    thousandSeparator=","
                    {...form.getInputProps(`items.${ri}.unitPrice`)}
                    withAsterisk
                  />
                </Group>
              </Box>
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
            <Group align="flex-end" gap="sm" mt="xs">
              <DatePickerInput
                clearable
                label={
                  <HelpLabel {...fieldHelp("purchaseOrder", "expectedDate")} />
                }
                leftSection={<IconCalendar size={14} />}
                maw={200}
                placeholder={tr("common.pickADate")}
                valueFormat="YYYY/MM/DD"
                {...form.getInputProps(`items.${ri}.expectedAt`)}
              />
              <TextInput
                flex={1}
                label={tr("common.notes")}
                placeholder={tr("common.lineNotesOptional")}
                {...form.getInputProps(`items.${ri}.notes`)}
              />
              <Text
                className="tabular-nums"
                ff="mono"
                fw={600}
                mb={8}
                size="sm"
                w={130}
              >
                {formatMoney(item.quantity * item.unitPrice)}
              </Text>
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
        <Group justify="flex-end">
          <Text fw={700}>
            {tr("common.totalAmount")} {formatMoney(total)}
          </Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
