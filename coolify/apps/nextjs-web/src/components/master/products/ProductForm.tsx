"use client";

/**
 * ProductForm.tsx — 製品 新規作成 / 編集フォーム (MS14 / MS24).
 *
 * 製品コードは保存時に自動採番（PRD-YYYYMM-NNNN）。
 *
 * ここで入れるのは**売り物としての製品**（名称・単位・税区分・キーワード）だけ。
 * 仕様（材種・直径・全長・製品種別と製品項目）は設計図の版が持ち、設計図
 * (PD06) で入れる — 改訂ごと・受注元ごとに図面と一緒に育つため。
 */

import {
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import {
  createProduct,
  updateProduct,
} from "@/app/(dashboard)/master/products/actions";
import { MasterKeywordsField } from "@/components/master/MasterKeywordsField";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { unitOptions } from "@/lib/enum-labels";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import type { Tr } from "@/lib/i18n";

const BASE_PATH = "/master/products";

function buildProductSchema(tr: Tr) {
  return z.object({
    nameJa: z.string().min(1, tr("master.productForm.enterNameJa")),
    nameTranslations: z.record(z.string(), z.string()).default({}),
    unit: z.string().min(1, tr("master.productForm.selectUnit")),
    // 課税区分。空 = 税区分マスタの既定に従う（取引先が指定していればそちらが勝つ）。
    taxCategoryId: z.string().nullable(),
    matchNames: z.array(z.string()),
    isExternalProduct: z.boolean(),
    makerName: z.string(),
    isActive: z.boolean(),
    notes: z.string(),
  });
}

type FormValues = z.infer<ReturnType<typeof buildProductSchema>>;

export interface ProductFormInitial {
  id: number;
  code: string | null;
  nameJa: string;
  nameTranslations: Record<string, string>;
  unit: string;
  taxCategoryId: number | null;
  matchNames: string[];
  isExternalProduct: boolean;
  makerName: string;
  isActive: boolean;
  notes: string;
}

export function ProductForm({
  initial,
  taxCategoryOptions,
}: {
  initial?: ProductFormInitial;
  /** 税区分マスタ (MS0F) の選択肢。先頭の「既定に従う」は画面側で足す。 */
  taxCategoryOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(buildProductSchema(tr)),
    initialValues: {
      nameJa: initial?.nameJa ?? "",
      nameTranslations: initial?.nameTranslations ?? {},
      unit: initial?.unit ?? tr("common.pcs"),
      taxCategoryId:
        initial?.taxCategoryId != null ? String(initial.taxCategoryId) : null,
      matchNames: initial?.matchNames ?? [],
      isExternalProduct: initial?.isExternalProduct ?? false,
      makerName: initial?.makerName ?? "",
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
    },
  });

  // キーワード生成に渡す「いま画面に出ている製品の姿」。
  const keywordSubject = {
    name: form.values.nameJa || form.values.nameTranslations.en || "",
    code: initial?.code ?? null,
    attributes: [
      {
        label: tr("common.englishName"),
        value: form.values.nameTranslations.en ?? "",
      },
      { label: tr("common.unit"), value: form.values.unit },
      { label: tr("common.notes"), value: form.values.notes },
    ].filter((a) => a.value.trim() !== ""),
  };

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const payload = values;
      const result = isEdit
        ? await updateProduct(initial.id, payload)
        : await createProduct(payload);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? tr("master.productForm.theProductWasUpdated")
            : tr("master.products.theProductWasCreated"),
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.id}`);
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
        tr("common.masterData"),
        { label: tr("master.productForm.productLabel"), href: BASE_PATH },
        isEdit ? tr("common.edit") : tr("common.new2"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={
        isEdit
          ? tr("master.productForm.editProductTitle", {
              name: initial.code ?? initial.nameJa,
            })
          : tr("master.products.newProduct")
      }
    >
      <FormSection title={tr("common.basicInformation")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={tr(
              "master.products.formatPrdYyyymmNnnnNumberedAutomatically",
            )}
            disabled
            label={<HelpLabel {...fieldHelp(tr, "product", "code")} />}
            placeholder={tr("common.numberedAutomaticallyOnSave")}
            // 内部 ID ではなく採番済みの製品コードを表示する
            // （レガシー取込の製品はコード未採番なので空欄）。
            value={initial?.code ?? ""}
          />
          <Select
            data={unitOptions(locale)}
            label={<HelpLabel {...fieldHelp(tr, "product", "unit")} />}
            withAsterisk
            {...form.getInputProps("unit")}
          />
          {/* 空 = 税区分マスタの既定に従う。取引先が課税区分を指定していれば
              そちらが勝つので、ここは「この製品そのものの区分」でしかない。 */}
          <Select
            clearable
            data={taxCategoryOptions}
            description={tr("master.products.taxCategoryHint")}
            label={tr("master.taxCategories.title")}
            placeholder={tr("master.taxCategories.useDefault")}
            {...form.getInputProps("taxCategoryId")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip(tr, "product", "name")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("common.name2")}
            required
            translationsProps={form.getInputProps("nameTranslations")}
          />
          <Switch
            label={<HelpLabel {...fieldHelp(tr, "product", "active")} />}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
          {/* 他社製品 = 再研磨専用。他社が作った工具を預かって研ぎ直すときの
              品目で、製造工程リスト・製造分の指示書・本番の明細では選べない。 */}
          <Switch
            description={tr("master.products.externalProductHint")}
            label={tr("master.products.externalProduct")}
            {...form.getInputProps("isExternalProduct", { type: "checkbox" })}
          />
          {form.values.isExternalProduct ? (
            <TextInput
              label={tr("master.products.makerName")}
              {...form.getInputProps("makerName")}
            />
          ) : null}
        </Stack>
        <Textarea
          label={<HelpLabel {...fieldHelp(tr, "product", "notes")} />}
          mt="sm"
          placeholder={tr("common.notesAndRemarks")}
          rows={3}
          {...form.getInputProps("notes")}
        />
        {/* 検索・AI 突合用の別名。候補は AI に作らせ、採用は人が決める。 */}
        <MasterKeywordsField
          kind="product"
          label={<HelpLabel {...fieldHelp(tr, "product", "keywords")} />}
          onChange={(v) => form.setFieldValue("matchNames", v)}
          subject={keywordSubject}
          value={form.values.matchNames}
        />
      </FormSection>
    </FormShell>
  );
}
