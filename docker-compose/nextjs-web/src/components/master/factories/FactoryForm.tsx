"use client";

/**
 * FactoryForm.tsx — 工場 新規作成 / 編集フォーム (MS1B / MS2B edit).
 *
 * 工場コードは手入力（unique）。識別子のため編集時は変更不可（disabled）。
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
import { useTransition } from "react";
import { z } from "zod";
import {
  createFactory,
  updateFactory,
} from "@/app/(dashboard)/master/factories/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { COUNTRY_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/factories";

const factorySchema = z.object({
  code: z.string().min(1, "工場コードを入力してください"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string(),
  nameKana: z.string(),
  countryCode: z.string().nullable(),
  postalCode: z.string(),
  addressJa: z.string(),
  addressEn: z.string(),
  phone: z.string(),
  email: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .or(z.literal("")),
  contactPerson: z.string(),
  isActive: z.boolean(),
  notes: z.string(),
});

type FormValues = z.infer<typeof factorySchema>;

export interface FactoryFormInitial {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  nameKana: string;
  countryCode: string | null;
  postalCode: string;
  addressJa: string;
  addressEn: string;
  phone: string;
  email: string;
  contactPerson: string;
  isActive: boolean;
  notes: string;
}

export function FactoryForm({ initial }: { initial?: FactoryFormInitial }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(factorySchema),
    initialValues: {
      code: initial?.code ?? "",
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      nameKana: initial?.nameKana ?? "",
      countryCode: initial?.countryCode ?? "JP",
      postalCode: initial?.postalCode ?? "",
      addressJa: initial?.addressJa ?? "",
      addressEn: initial?.addressEn ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      contactPerson: initial?.contactPerson ?? "",
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateFactory(initial.id, values)
        : await createFactory(values);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "工場を更新しました" : "工場を作成しました",
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
        { label: "工場", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={isEdit ? `工場 編集 — ${initial.code}` : "工場 新規作成"}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={
              isEdit ? "作成後は変更できません" : "工場を識別する一意のコード"
            }
            disabled={isEdit}
            label="工場コード"
            placeholder="例: F01"
            withAsterisk={!isEdit}
            {...form.getInputProps("code")}
          />
          <TextInput
            label="よみがな"
            placeholder="例: ほんしゃこうじょう"
            {...form.getInputProps("nameKana")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            enProps={form.getInputProps("nameEn")}
            jaProps={form.getInputProps("nameJa")}
            label="名称"
            required
          />
          <Switch
            label="有効"
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </Stack>
        <Textarea
          label="備考"
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
            data={COUNTRY_OPTIONS}
            label="国"
            placeholder="国を選択"
            {...form.getInputProps("countryCode")}
          />
          <TextInput
            label="郵便番号"
            placeholder="例: 123-4567"
            {...form.getInputProps("postalCode")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            enProps={form.getInputProps("addressEn")}
            jaProps={form.getInputProps("addressJa")}
            label="住所"
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label="電話番号"
            placeholder="例: 03-1234-5678"
            {...form.getInputProps("phone")}
          />
          <TextInput
            label="メールアドレス"
            placeholder="例: factory@example.co.jp"
            {...form.getInputProps("email")}
          />
        </SimpleGrid>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label="担当者"
            placeholder="例: 山田 太郎"
            {...form.getInputProps("contactPerson")}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
