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
import { HelpLabel } from "@/components/ui/HelpLabel";
import { FormSection, LocalizedTextInput } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { COUNTRY_OPTIONS } from "@/lib/enum-labels";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n";
import { MatchNameSuggestions } from "./MatchNameSuggestions";

/** 見積書/納品書/請求書の言語（documentLocale）用の Select data。 */
const DOCUMENT_LOCALE_OPTIONS = LOCALES.map((l) => ({
  value: l,
  label: LOCALE_LABELS[l],
}));

export const bpBaseFormSchema = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameTranslations: z.record(z.string(), z.string()).default({}),
  nameKana: z.string(),
  shortName: z.string(),
  countryCode: z.string().nullable(),
  postalCode: z.string(),
  addressJa: z.string(),
  addressTranslations: z.record(z.string(), z.string()).default({}),
  phone: z.string(),
  fax: z.string(),
  email: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .or(z.literal("")),
  website: z.string(),
  taxNumber: z.string(),
  documentLocale: z.string().nullable(),
  matchNames: z.array(z.string()),
  isActive: z.boolean(),
  notes: z.string(),
});

export type BpBaseFormValues = z.infer<typeof bpBaseFormSchema>;

export function bpBaseInitialValues(d?: BpBaseDetail): BpBaseFormValues {
  return {
    nameJa: d?.nameJa ?? "",
    nameTranslations: d?.nameTranslations ?? {},
    nameKana: d?.nameKana ?? "",
    shortName: d?.shortName ?? "",
    countryCode: d?.countryCode ?? "JP",
    postalCode: d?.postalCode ?? "",
    addressJa: d?.addressJa ?? "",
    addressTranslations: d?.addressTranslations ?? {},
    phone: d?.phone ?? "",
    fax: d?.fax ?? "",
    email: d?.email ?? "",
    website: d?.website ?? "",
    taxNumber: d?.taxNumber ?? "",
    documentLocale: d?.documentLocale ?? null,
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
  // 同じ理由（T が BpBaseFormValues の拡張）で setFieldValue も narrow できない。
  const setMatchNames = (values: string[]) =>
    (form.setFieldValue as (path: string, value: string[]) => void)(
      "matchNames",
      values,
    );
  return (
    <>
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={codeDescription}
            disabled
            label={
              <HelpLabel
                {...fieldHelp("businessPartner", "bpCode", {
                  label: "BPコード",
                })}
              />
            }
            placeholder="保存時に自動採番"
            value={bpCode ?? ""}
          />
          <Select
            clearable
            data={COUNTRY_OPTIONS}
            label={<HelpLabel {...fieldHelp("businessPartner", "country")} />}
            placeholder="国を選択"
            {...props("countryCode")}
          />
          <Select
            clearable
            data={DOCUMENT_LOCALE_OPTIONS}
            description="見積書・納品書・請求書をこの言語で発行する。未設定は既定言語（日本語）"
            label="書類の言語"
            placeholder="既定言語（日本語）"
            {...props("documentLocale")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip("businessPartner", "name")}
            jaProps={props("nameJa")}
            label="名称"
            required
            translationsProps={props("nameTranslations")}
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("businessPartner", "nameKana", {
                  label: "フリガナ",
                })}
              />
            }
            placeholder="エービーシーセイサクショ"
            {...props("nameKana")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("businessPartner", "nameKana", { label: "略称" })}
              />
            }
            placeholder="ABC"
            {...props("shortName")}
          />
          <TextInput
            label={<HelpLabel {...fieldHelp("businessPartner", "taxNumber")} />}
            placeholder="1234567890123"
            {...props("taxNumber")}
          />
          <Switch
            label={<HelpLabel {...fieldHelp("businessPartner", "active")} />}
            mt={isMobile ? 0 : "xl"}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </SimpleGrid>
        <TagsInput
          description="AI 抽出（注文書の読み取り）がこの取引先へ社名を解決するための照合リスト。表記ゆれ（㈱/株式会社・全角半角・旧社名など）を Enter 区切りで登録"
          label={
            <HelpLabel
              {...fieldHelp("businessPartner", "matchNames", {
                label: "AI照合名",
              })}
            />
          }
          mt="sm"
          placeholder="社名の表記ゆれを入力して Enter"
          splitChars={[",", "、"]}
          {...form.getInputProps("matchNames")}
        />
        {/* 足りない字種の指摘 + 機械的に作れる候補（lib/company-aliases）。 */}
        <MatchNameSuggestions
          matchNames={form.values.matchNames ?? []}
          nameEn={form.values.nameTranslations.en}
          nameJa={form.values.nameJa ?? ""}
          nameKana={form.values.nameKana}
          onAdd={(values) =>
            setMatchNames([
              ...new Set([...(form.values.matchNames ?? []), ...values]),
            ])
          }
          shortName={form.values.shortName}
        />
      </FormSection>

      <FormSection title="住所・連絡先">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("businessPartner", "address", {
                  label: "郵便番号",
                })}
              />
            }
            placeholder="100-0001"
            {...props("postalCode")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip("businessPartner", "address")}
            jaProps={props("addressJa")}
            label="住所"
            translationsProps={props("addressTranslations")}
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("businessPartner", "contact", {
                  label: "電話番号",
                })}
              />
            }
            placeholder="03-1234-5678"
            {...props("phone")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("businessPartner", "contact", { label: "FAX" })}
              />
            }
            placeholder="03-1234-5679"
            {...props("fax")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("businessPartner", "contact", {
                  label: "メールアドレス",
                })}
              />
            }
            placeholder="info@example.co.jp"
            {...props("email")}
          />
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("businessPartner", "contact", {
                  label: "Webサイト",
                })}
              />
            }
            placeholder="https://example.co.jp"
            {...props("website")}
          />
        </SimpleGrid>
        <Textarea
          label={<HelpLabel {...fieldHelp("businessPartner", "notes")} />}
          mt="sm"
          placeholder="備考・特記事項"
          rows={3}
          {...props("notes")}
        />
      </FormSection>
    </>
  );
}
