"use client";

/**
 * MaterialReceiptForm — 素材入荷 新規登録 (PU11, design.md §8.3)。
 *
 * 直接調達（発注書を経由しない外部調達）の入荷登録。
 * 素材 SearchSelect（必須）/ 仕入先 Select（任意）/ 入荷先工場 Select（任意）/
 * 数量 + 単位 / 入荷日（既定: 今日）/ 備考。
 * 保存で material_receipts を作成し onMaterialReceipt で在庫入庫 → 詳細へ。
 * 発注入荷は素材発注書 (PU03) の「入荷完了」から自動作成される。
 */

import { NumberInput, Select, SimpleGrid, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconCalendar } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import { searchMaterialOptions } from "@/app/(dashboard)/_shared/option-search";
import { createMaterialReceipt } from "@/app/(dashboard)/purchase/material-receipts/actions";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormSection, FormShell } from "@/components/ui/shells";
import { UNIT_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/purchase/material-receipts";

interface Option {
  value: string;
  label: string;
}

const schema = z.object({
  materialId: z.string().min(1, "素材を選択してください"),
  supplierBpId: z.string().nullable(),
  factoryId: z.string().nullable(),
  quantity: z.number().positive("0より大きい値"),
  unit: z.string().min(1, "必須"),
  receivedAt: z.string().min(1, "入荷日を入力してください"),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

export function MaterialReceiptForm({
  supplierOptions,
  factoryOptions,
}: {
  /** 仕入先（VENDOR ロールの有効 BP）。value = uuid。 */
  supplierOptions: Option[];
  /** 入荷先工場（有効のみ）。value = String(内部 id)。 */
  factoryOptions: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: {
      materialId: "",
      supplierBpId: null,
      factoryId: null,
      quantity: 1,
      unit: "本",
      receivedAt: today(),
      notes: "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await createMaterialReceipt({
        materialId: values.materialId,
        supplierBpId: values.supplierBpId,
        factoryId: values.factoryId,
        quantity: values.quantity,
        unit: values.unit,
        receivedAt: values.receivedAt,
        notes: values.notes,
      });
      if (result.ok) {
        notifications.show({
          title: "登録しました",
          message: "素材入荷を登録し、素材在庫へ入庫しました",
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.id}`);
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
      breadcrumbs={["購買", { label: "素材入荷", href: BASE_PATH }, "新規登録"]}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="登録"
      title="素材入荷 新規登録"
    >
      <FormSection
        description="直接調達（発注書を経由しない入荷）を登録します。登録と同時に入荷先工場の素材在庫へ入庫されます。発注入荷は素材発注書の「入荷完了」から自動登録されます。"
        title="入荷情報"
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <SearchSelect
            error={form.errors.materialId}
            label="素材"
            onChange={(v) => form.setFieldValue("materialId", v ?? "")}
            onSearch={searchMaterialOptions}
            placeholder="素材を検索"
            storageKey="material"
            value={form.values.materialId || null}
            withAsterisk
          />
          <Select
            clearable
            data={supplierOptions}
            label="仕入先"
            placeholder="仕入先を選択（任意）"
            searchable
            {...form.getInputProps("supplierBpId")}
          />
          <Select
            clearable
            data={factoryOptions}
            label="入荷先工場"
            placeholder="工場を選択（任意）"
            {...form.getInputProps("factoryId")}
          />
          <DatePickerInput
            label="入荷日"
            leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD"
            withAsterisk
            {...form.getInputProps("receivedAt")}
          />
          <NumberInput
            decimalScale={3}
            label="数量"
            min={0}
            withAsterisk
            {...form.getInputProps("quantity")}
          />
          <Select
            data={UNIT_OPTIONS}
            label="単位"
            withAsterisk
            {...form.getInputProps("unit")}
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
    </FormShell>
  );
}
