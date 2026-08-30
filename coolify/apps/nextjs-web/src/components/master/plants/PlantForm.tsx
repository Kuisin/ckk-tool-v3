"use client";

/**
 * PlantForm.tsx — 拠点 新規作成 / 編集フォーム (MS1C / MS2C edit).
 *
 * 拠点コードは手入力（unique）。識別子のため編集時は変更不可（disabled）。
 * 名称・住所は { ja, en } ペア入力（LocalizedTextInput）。
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
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import {
  createPlant,
  updatePlant,
} from "@/app/(dashboard)/master/plants/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { countryOptions } from "@/lib/enum-labels";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/plants";

const plantSchema = z.object({
  code: z.string().min(1, "拠点コードを入力してください"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameTranslations: z.record(z.string(), z.string()).default({}),
  nameKana: z.string(),
  countryCode: z.string().nullable(),
  regionId: z.string().nullable(),
  postalCode: z.string(),
  addressJa: z.string(),
  addressTranslations: z.record(z.string(), z.string()).default({}),
  phone: z.string(),
  email: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .or(z.literal("")),
  contactPerson: z.string(),
  isActive: z.boolean(),
  notes: z.string(),
});

type FormValues = z.infer<typeof plantSchema>;

export interface PlantFormInitial {
  id: number;
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  nameKana: string;
  countryCode: string | null;
  regionId: number | null;
  postalCode: string;
  addressJa: string;
  addressTranslations: Record<string, string>;
  phone: string;
  email: string;
  contactPerson: string;
  isActive: boolean;
  notes: string;
}

export function PlantForm({
  initial,
  regionOptions,
}: {
  initial?: PlantFormInitial;
  /** 地域 Select の選択肢（value = String(region id)）。 */
  regionOptions: { value: string; label: string }[];
}) {
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(plantSchema),
    initialValues: {
      code: initial?.code ?? "",
      nameJa: initial?.nameJa ?? "",
      nameTranslations: initial?.nameTranslations ?? {},
      nameKana: initial?.nameKana ?? "",
      countryCode: initial?.countryCode ?? "JP",
      regionId: initial?.regionId != null ? String(initial.regionId) : null,
      postalCode: initial?.postalCode ?? "",
      addressJa: initial?.addressJa ?? "",
      addressTranslations: initial?.addressTranslations ?? {},
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      contactPerson: initial?.contactPerson ?? "",
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      regionId: values.regionId ? Number(values.regionId) : null,
    };
    startTransition(async () => {
      const result = isEdit
        ? await updatePlant(initial.id, payload)
        : await createPlant(payload);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "拠点を更新しました" : "拠点を作成しました",
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
      breadcrumbs={[
        "マスタ",
        { label: "拠点", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={isEdit ? `拠点 編集 — ${initial.code}` : "拠点 新規作成"}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={
              isEdit ? "作成後は変更できません" : "拠点を識別する一意のコード"
            }
            disabled={isEdit}
            label={<HelpLabel {...fieldHelp("plant", "code")} />}
            placeholder="例: F01"
            withAsterisk={!isEdit}
            {...form.getInputProps("code")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "name", { label: "よみがな" })}
              />
            }
            placeholder="例: ほんしゃこうじょう"
            {...form.getInputProps("nameKana")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip("plant", "name")}
            jaProps={form.getInputProps("nameJa")}
            label="名称"
            required
            translationsProps={form.getInputProps("nameTranslations")}
          />
          <Switch
            label={<HelpLabel {...fieldHelp("plant", "active")} />}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </Stack>
        <Textarea
          label={<HelpLabel {...fieldHelp("plant", "notes")} />}
          mt="sm"
          placeholder="備考・特記事項"
          rows={3}
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection title="連絡先・住所">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select
            clearable
            data={countryOptions(locale)}
            label={
              <HelpLabel {...fieldHelp("plant", "region", { label: "国" })} />
            }
            placeholder="国を選択"
            {...form.getInputProps("countryCode")}
          />
          <Select
            clearable
            data={regionOptions}
            description="REGION スコープ権限の対象地域"
            label={
              <HelpLabel {...fieldHelp("plant", "region", { label: "地域" })} />
            }
            placeholder="地域を選択"
            searchable={regionOptions.length > 5}
            {...form.getInputProps("regionId")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "address", { label: "郵便番号" })}
              />
            }
            placeholder="例: 123-4567"
            {...form.getInputProps("postalCode")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip("plant", "address")}
            jaProps={form.getInputProps("addressJa")}
            label="住所"
            translationsProps={form.getInputProps("addressTranslations")}
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "contact", { label: "電話番号" })}
              />
            }
            placeholder="例: 03-1234-5678"
            {...form.getInputProps("phone")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "contact", { label: "メールアドレス" })}
              />
            }
            placeholder="例: plant@example.co.jp"
            {...form.getInputProps("email")}
          />
        </SimpleGrid>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("plant", "contact", { label: "担当者" })}
              />
            }
            placeholder="例: 山田 太郎"
            {...form.getInputProps("contactPerson")}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
