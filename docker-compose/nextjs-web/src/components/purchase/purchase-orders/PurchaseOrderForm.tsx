"use client";

/**
 * PurchaseOrderForm — 素材発注書 新規作成 / 編集 (PU03, design.md §8.3)。
 *
 * ヘッダ（仕入先 Select（VENDOR ロール BP）/ 発注日 / 備考）+ 明細 1..N 行
 * （素材 SearchSelect / 入荷先工場 Select / 数量 + 単位 / 単価 / 金額自動 /
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
import { useTransition } from "react";
import { z } from "zod";
import { searchMaterialOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
} from "@/app/(dashboard)/purchase/purchase-orders/actions";
import { GhostButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { UNIT_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import { formatMoney } from "@/lib/format";
import type { PurchaseOrderView } from "./model";

const BASE_PATH = "/purchase/purchase-orders";

interface Option {
  value: string;
  label: string;
}

const itemSchema = z.object({
  rowId: z.string(),
  materialId: z.string().min(1, "素材を選択してください"),
  materialLabel: z.string(),
  factoryId: z.string().nullable(),
  quantity: z.number().positive("0より大きい値"),
  unit: z.string().min(1, "必須"),
  unitPrice: z.number().min(0, "0以上"),
  expectedAt: z.string().nullable(),
  notes: z.string(),
});

const schema = z.object({
  supplierBpId: z.string().min(1, "仕入先を選択してください"),
  purchaseDate: z.string().nullable(),
  notes: z.string(),
  items: z.array(itemSchema).min(1, "明細を1件以上追加してください"),
});

type FormValues = z.infer<typeof schema>;
type ItemForm = FormValues["items"][number];

let rowSeq = 0;
const newRowId = () => `row-${++rowSeq}-${Date.now()}`;

const emptyItem = (): ItemForm => ({
  rowId: newRowId(),
  materialId: "",
  materialLabel: "",
  factoryId: null,
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
      factoryId: it.factoryId,
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
  factoryOptions,
}: {
  mode: "create" | "edit";
  /** 編集時: 対象発注書（サーバー取得の view-model）。 */
  purchaseOrder?: PurchaseOrderView | null;
  /** 仕入先（VENDOR ロールの有効 BP）。value = uuid。 */
  supplierOptions: Option[];
  /** 入荷先工場（有効のみ）。value = String(内部 id)。 */
  factoryOptions: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const poNumber = mode === "edit" ? purchaseOrder?.poNumber : undefined;

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
          factoryId: it.factoryId,
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
          title: "保存しました",
          message:
            mode === "edit"
              ? `素材発注書 ${result.data.poNumber} を更新しました`
              : `素材発注書 ${result.data.poNumber} を作成しました`,
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.poNumber}`);
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
        "購買",
        { label: "素材発注書", href: BASE_PATH },
        mode === "edit" ? "編集" : "新規作成",
      ]}
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
          ? `素材発注書 編集 ${poNumber ?? ""}`
          : "素材発注書 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            clearable
            data={supplierOptions}
            label="仕入先"
            placeholder="仕入先を選択"
            searchable
            withAsterisk
            {...form.getInputProps("supplierBpId")}
          />
          <DatePickerInput
            clearable
            description="未入力の場合は発注実行時に自動設定されます"
            label="発注日"
            leftSection={<IconCalendar size={14} />}
            placeholder="日付を選択"
            valueFormat="YYYY/MM/DD"
            {...form.getInputProps("purchaseDate")}
          />
        </SimpleGrid>
        <Textarea
          autosize
          label="備考"
          minRows={2}
          mt="sm"
          placeholder="備考（任意）"
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection
        description="金額は 数量 × 単価 でサーバー側で計算されます。発注（ORDERED）後は明細が素材 ATP の入荷予定に反映されます。"
        title="明細"
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
                    label="素材"
                    onChange={(v, opt) => {
                      form.setFieldValue(`items.${ri}.materialId`, v ?? "");
                      form.setFieldValue(
                        `items.${ri}.materialLabel`,
                        opt?.label ?? "",
                      );
                    }}
                    onSearch={searchMaterialOptions}
                    placeholder="素材を検索"
                    storageKey="material"
                    value={item.materialId || null}
                    withAsterisk
                  />
                  <Select
                    clearable
                    data={factoryOptions}
                    label="入荷先工場"
                    maw={180}
                    placeholder="工場を選択"
                    {...form.getInputProps(`items.${ri}.factoryId`)}
                  />
                  <NumberInput
                    decimalScale={3}
                    error={form.errors[`items.${ri}.quantity`]}
                    label="数量"
                    maw={110}
                    min={0}
                    {...form.getInputProps(`items.${ri}.quantity`)}
                    withAsterisk
                  />
                  <Select
                    data={UNIT_OPTIONS}
                    label="単位"
                    maw={90}
                    withAsterisk
                    {...form.getInputProps(`items.${ri}.unit`)}
                  />
                  <NumberInput
                    decimalScale={2}
                    error={form.errors[`items.${ri}.unitPrice`]}
                    label="単価"
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
            <Group align="flex-end" gap="sm" mt="xs">
              <DatePickerInput
                clearable
                label="入荷予定日"
                leftSection={<IconCalendar size={14} />}
                maw={200}
                placeholder="日付を選択"
                valueFormat="YYYY/MM/DD"
                {...form.getInputProps(`items.${ri}.expectedAt`)}
              />
              <TextInput
                flex={1}
                label="備考"
                placeholder="行の備考（任意）"
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
          明細を追加
        </GhostButton>

        <Divider my="md" />
        <Group justify="flex-end">
          <Text fw={700}>合計金額 {formatMoney(total)}</Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
