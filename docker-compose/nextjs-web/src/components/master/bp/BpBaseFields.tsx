"use client";

/**
 * BpBaseFields.tsx — bp.business_partners 共通カラムのフォームセクション。
 *
 * 顧客 / 支店 / 最終需要家 / 外注企業 の各フォームが同じ法人基本情報
 * （名称・住所・連絡先）を持つため、フィールド定義と zod スキーマを共有する。
 */

import {
  Select,
  SimpleGrid,
  Stack,
  Switch,
  TagsInput,
  Textarea,
  TextInput,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { z } from "zod";
import type { BpBaseDetail } from "@/app/(dashboard)/master/_shared/bp-data";
import { FormSection, LocalizedTextInput } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { COUNTRY_OPTIONS } from "@/lib/enum-labels";

export const bpBaseFormSchema = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string(),
  nameKana: z.string(),
  shortName: z.string(),
  countryCode: z.string().nullable(),
  postalCode: z.string(),
  addressJa: z.string(),
  addressEn: z.string(),
  phone: z.string(),
  fax: z.string(),
  email: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .or(z.literal("")),
  website: z.string(),
  taxNumber: z.string(),
  matchNames: z.array(z.string()),
  isActive: z.boolean(),
  notes: z.string(),
});

export type BpBaseFormValues = z.infer<typeof bpBaseFormSchema>;

export function bpBaseInitialValues(d?: BpBaseDetail): BpBaseFormValues {
  return {
    nameJa: d?.nameJa ?? "",
    nameEn: d?.nameEn ?? "",
    nameKana: d?.nameKana ?? "",
    shortName: d?.shortName ?? "",
    countryCode: d?.countryCode ?? "JP",
    postalCode: d?.postalCode ?? "",
    addressJa: d?.addressJa ?? "",
    addressEn: d?.addressEn ?? "",
    phone: d?.phone ?? "",
    fax: d?.fax ?? "",
    email: d?.email ?? "",
    website: d?.website ?? "",
    taxNumber: d?.taxNumber ?? "",
    matchNames: d?.matchNames ?? [],
    isActive: d?.isActive ?? true,
    notes: d?.notes ?? "",
  };
}

/** 基本情報 + 連絡先の 2 セクションを描画する。 */
export function BpBaseFields<T extends BpBaseFormValues>({
  form,
  bpCode,
  codeDescription,
}: {
  form: UseFormReturnType<T>;
  bpCode?: string;
  codeDescription: string;
}) {
  const isMobile = useIsMobile();
  // Field paths are shared with the extended form value types.
  const props = (path: string) => form.getInputProps(path);
  return (
    <>
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={codeDescription}
            disabled
            label="BPコード"
            placeholder="保存時に自動採番"
            value={bpCode ?? ""}
          />
          <Select
            clearable
            data={COUNTRY_OPTIONS}
            label="国"
            placeholder="国を選択"
            {...props("countryCode")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            enProps={props("nameEn")}
            jaProps={props("nameJa")}
            label="名称"
            required
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label="フリガナ"
            placeholder="エービーシーセイサクショ"
            {...props("nameKana")}
          />
          <TextInput label="略称" placeholder="ABC" {...props("shortName")} />
          <TextInput
            label="法人番号"
            placeholder="1234567890123"
            {...props("taxNumber")}
          />
          <Switch
            label="有効"
            mt={isMobile ? 0 : "xl"}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </SimpleGrid>
        <TagsInput
          description="AI 抽出（注文書の読み取り）がこの取引先へ社名を解決するための照合リスト。表記ゆれ（㈱/株式会社・全角半角・旧社名など）を Enter 区切りで登録"
          label="AI照合名"
          mt="sm"
          placeholder="社名の表記ゆれを入力して Enter"
          splitChars={[",", "、"]}
          {...form.getInputProps("matchNames")}
        />
      </FormSection>

      <FormSection title="住所・連絡先">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label="郵便番号"
            placeholder="100-0001"
            {...props("postalCode")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            enProps={props("addressEn")}
            jaProps={props("addressJa")}
            label="住所"
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label="電話番号"
            placeholder="03-1234-5678"
            {...props("phone")}
          />
          <TextInput label="FAX" placeholder="03-1234-5679" {...props("fax")} />
          <TextInput
            label="メールアドレス"
            placeholder="info@example.co.jp"
            {...props("email")}
          />
          <TextInput
            label="Webサイト"
            placeholder="https://example.co.jp"
            {...props("website")}
          />
        </SimpleGrid>
        <Textarea
          label="備考"
          mt="sm"
          placeholder="備考・特記事項"
          rows={3}
          {...props("notes")}
        />
      </FormSection>
    </>
  );
}
