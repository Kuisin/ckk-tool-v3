"use client";

/**
 * StockTakeForm — 棚卸 新規登録 (PD18, design.md §8.3)。
 *
 * 拠点（必須）+ 保管場所（任意・選んだ拠点のものだけに絞る）+ 備考。
 * 保存すると対象バケット（product_inventory / material_inventory）をその場で
 * 取り込む — 0 件なら保存自体が失敗する（数える対象が無い棚卸を作らない）。
 */

import { Select, SimpleGrid, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { z } from "zod";
import { createStockTake } from "@/app/(dashboard)/inventory/stock-takes/actions";
import type { StorageLocationOption } from "@/app/(dashboard)/inventory/stock-takes/data";
import { FormSection, FormShell } from "@/components/ui/shells";
import { categoryLabel } from "@/lib/app-list";
import { zodResolver } from "@/lib/form";
import type { Locale } from "@/lib/i18n";

const BASE_PATH = "/inventory/stock-takes";

interface Option {
  value: string;
  label: string;
}

function buildSchema(tr: ReturnType<typeof useTranslations>) {
  return z.object({
    plantId: z.string().min(1, tr("production.stockTakes.form.selectAPlant")),
    storageLocationId: z.string().nullable(),
    notes: z.string(),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

export function StockTakeForm({
  plantOptions,
  storageLocationOptions,
}: {
  /** 拠点（有効のみ）。value = String(内部 id)。 */
  plantOptions: Option[];
  /** 保管場所（有効のみ・拠点 id 付き）。 */
  storageLocationOptions: StorageLocationOption[];
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const schema = buildSchema(tr);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: {
      plantId: "",
      storageLocationId: null,
      notes: "",
    },
  });

  // 選んだ拠点の保管場所だけに絞る（拠点未選択は全件、CustomerSelect と同じ二段階）。
  const filteredStorageLocations: Option[] = useMemo(() => {
    if (!form.values.plantId) return [];
    const plantId = Number(form.values.plantId);
    return storageLocationOptions
      .filter((o) => o.plantId === plantId)
      .map((o) => ({ value: o.value, label: o.label }));
  }, [storageLocationOptions, form.values.plantId]);

  const selectPlant = (plantId: string | null) => {
    form.setFieldValue("plantId", plantId ?? "");
    // 拠点を変えたら保管場所の選択は捨てる（別拠点の保管場所は選べない）。
    form.setFieldValue("storageLocationId", null);
  };

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await createStockTake({
        plantId: values.plantId,
        storageLocationId: values.storageLocationId,
        notes: values.notes,
      });
      if (result.ok) {
        notifications.show({
          title: tr("production.stockTakes.form.created"),
          message: tr("production.stockTakes.form.createdBody", {
            number: result.data.stockTakeNumber,
          }),
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.stockTakeNumber}`);
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
        categoryLabel("在庫", locale), // i18n-ignore — app-list のカテゴリ名（対訳は app-list.ts が持つ）
        { label: tr("common.stockTake"), href: BASE_PATH },
        tr("production.stockTakes.form.newTitle"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel={tr("common.register")}
      title={tr("production.stockTakes.form.newTitle")}
    >
      <FormSection
        description={tr("production.stockTakes.form.sectionDescription")}
        title={tr("production.stockTakes.form.sectionTitle")}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            data={plantOptions}
            error={form.errors.plantId}
            label={tr("common.site")}
            onChange={selectPlant}
            placeholder={tr("production.stockTakes.form.selectAPlant")}
            searchable
            value={form.values.plantId || null}
            withAsterisk
          />
          <Select
            clearable
            data={filteredStorageLocations}
            disabled={!form.values.plantId}
            label={tr("production.stockTakes.table.storageLocation")}
            placeholder={
              form.values.plantId
                ? tr("production.stockTakes.form.selectAStorageLocation")
                : tr("production.stockTakes.form.selectAPlantFirst")
            }
            searchable
            {...form.getInputProps("storageLocationId")}
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
    </FormShell>
  );
}
