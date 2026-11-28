"use client";

/**
 * OwnCompanyForm.tsx — 自社法人 新規作成 / 編集フォーム (MS1I / MS2I edit).
 *
 * コードは手入力（unique）。書類番号に埋め込まれる識別子のため編集時は
 * 読み取り専用（DB もトリガー own_companies_code_immutable で拒否する）。名称・住所は
 * LocalizedTextInput（ja 欄 + 多言語モーダル）。社印は詳細画面の「社印」タブで
 * 扱う（画像は Server Action では送れないため、フォームには載せない）。
 */

import {
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import {
  createOwnCompany,
  updateOwnCompany,
} from "@/app/(dashboard)/master/own-companies/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { zodResolver } from "@/lib/form";
import { isValidInvoiceRegistrationNo } from "@/lib/own-company-core";

const BASE_PATH = "/master/own-companies";

interface FormValues {
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  nameKana: string;
  postalCode: string;
  addressJa: string;
  addressTranslations: Record<string, string>;
  phone: string;
  fax: string;
  email: string;
  invoiceRegistrationNo: string;
  bankName: string;
  bankBranch: string;
  bankAccountType: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  fiscalYearStartMonth: number;
  isDefault: boolean;
  isActive: boolean;
  notes: string;
}

export interface OwnCompanyFormInitial extends FormValues {
  id: number;
  /**
   * 会計年度の開始月が閉じているか（この法人がもう採番している）。閉じていれば
   * 欄を無効にして理由を出す。DB のトリガーと Server Action も同じ条件で拒否する。
   */
  fiscalYearLocked?: boolean;
}

export function OwnCompanyForm({
  initial,
}: {
  initial?: OwnCompanyFormInitial;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;
  // 既定の法人は「別の法人を既定にする」ことでしか外せない（サーバーでも拒否）。
  const defaultLocked = !!initial?.isDefault;
  const fiscalYearLocked = !!initial?.fiscalYearLocked;

  const schema = z.object({
    code: z.string().trim().min(1, tr("master.ownCompanies.enterCode")),
    nameJa: z.string().min(1, tr("common.enterNameInJapanese")),
    nameTranslations: z.record(z.string(), z.string()).default({}),
    nameKana: z.string(),
    postalCode: z.string(),
    addressJa: z.string(),
    addressTranslations: z.record(z.string(), z.string()).default({}),
    phone: z.string(),
    fax: z.string(),
    email: z.string().email(tr("common.invalidEmailFormat")).or(z.literal("")),
    invoiceRegistrationNo: z
      .string()
      .refine(
        (v) => isValidInvoiceRegistrationNo(v),
        tr("master.ownCompanies.invalidRegistrationNo"),
      ),
    bankName: z.string(),
    bankBranch: z.string(),
    bankAccountType: z.string(),
    bankAccountNumber: z.string(),
    bankAccountHolder: z.string(),
    fiscalYearStartMonth: z
      .number({ message: tr("master.ownCompanies.invalidFiscalMonth") })
      .int()
      .min(1, tr("master.ownCompanies.invalidFiscalMonth"))
      .max(12, tr("master.ownCompanies.invalidFiscalMonth")),
    isDefault: z.boolean(),
    isActive: z.boolean(),
    notes: z.string(),
  });

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: {
      code: initial?.code ?? "",
      nameJa: initial?.nameJa ?? "",
      nameTranslations: initial?.nameTranslations ?? {},
      nameKana: initial?.nameKana ?? "",
      postalCode: initial?.postalCode ?? "",
      addressJa: initial?.addressJa ?? "",
      addressTranslations: initial?.addressTranslations ?? {},
      phone: initial?.phone ?? "",
      fax: initial?.fax ?? "",
      email: initial?.email ?? "",
      invoiceRegistrationNo: initial?.invoiceRegistrationNo ?? "",
      bankName: initial?.bankName ?? "",
      bankBranch: initial?.bankBranch ?? "",
      bankAccountType: initial?.bankAccountType ?? "",
      bankAccountNumber: initial?.bankAccountNumber ?? "",
      bankAccountHolder: initial?.bankAccountHolder ?? "",
      fiscalYearStartMonth: initial?.fiscalYearStartMonth ?? 4,
      isDefault: initial?.isDefault ?? false,
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateOwnCompany(initial.id, values)
        : await createOwnCompany(values);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? tr("master.ownCompanies.updated")
            : tr("master.ownCompanies.created"),
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
        { label: tr("master.ownCompanies.title"), href: BASE_PATH },
        isEdit ? tr("common.edit2") : tr("common.new2"),
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
          ? tr("master.ownCompanies.editTitle", { code: initial.code })
          : tr("master.ownCompanies.newTitle")
      }
    >
      <FormSection title={tr("common.basicInformation")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={
              isEdit
                ? tr("common.itCannotBeChangedOnceCreated")
                : tr("master.ownCompanies.codeDesc")
            }
            disabled={isEdit}
            label={tr("master.ownCompanies.code")}
            placeholder={tr("master.ownCompanies.codePlaceholder")}
            withAsterisk={!isEdit}
            {...form.getInputProps("code")}
          />
          <TextInput
            label={tr("common.kana2")}
            {...form.getInputProps("nameKana")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            jaProps={form.getInputProps("nameJa")}
            label={tr("common.name2")}
            required
            translationsProps={form.getInputProps("nameTranslations")}
          />
          <TextInput
            description={tr("master.ownCompanies.registrationNoDesc")}
            label={tr("master.ownCompanies.registrationNoLabel")}
            placeholder={tr("master.ownCompanies.registrationNoPlaceholder")}
            {...form.getInputProps("invoiceRegistrationNo")}
          />
          <NumberInput
            allowDecimal={false}
            description={
              fiscalYearLocked
                ? tr("master.ownCompanies.fiscalYearLocked")
                : tr("master.ownCompanies.fiscalYearStartMonthDesc")
            }
            disabled={fiscalYearLocked}
            label={tr("master.ownCompanies.fiscalYearStartMonth")}
            max={12}
            min={1}
            {...form.getInputProps("fiscalYearStartMonth")}
          />
          <Switch
            description={tr("master.ownCompanies.defaultDesc")}
            disabled={defaultLocked}
            label={tr("master.ownCompanies.defaultCompany")}
            {...form.getInputProps("isDefault", { type: "checkbox" })}
          />
          <Switch
            disabled={form.values.isDefault}
            label={tr("common.enabled")}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </Stack>
        <Textarea
          label={tr("common.notes")}
          mt="sm"
          placeholder={tr("common.notesAndRemarks")}
          rows={3}
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection title={tr("master.ownCompanies.contact")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label={tr("common.postalCode")}
            placeholder={tr("master.plants.eG1234567")}
            {...form.getInputProps("postalCode")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            jaProps={form.getInputProps("addressJa")}
            label={tr("common.address")}
            translationsProps={form.getInputProps("addressTranslations")}
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <TextInput
            label={tr("common.phoneNumber")}
            placeholder={tr("master.plants.eG0312345678")}
            {...form.getInputProps("phone")}
          />
          <TextInput
            label={tr("master.ownCompanies.fax")}
            placeholder={tr("master.plants.eG0312345678")}
            {...form.getInputProps("fax")}
          />
          <TextInput
            label={tr("common.emailAddress")}
            {...form.getInputProps("email")}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection title={tr("master.ownCompanies.bank")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label={tr("master.ownCompanies.bankName")}
            {...form.getInputProps("bankName")}
          />
          <TextInput
            label={tr("master.ownCompanies.bankBranch")}
            {...form.getInputProps("bankBranch")}
          />
          <TextInput
            label={tr("master.ownCompanies.bankAccountType")}
            {...form.getInputProps("bankAccountType")}
          />
          <TextInput
            label={tr("master.ownCompanies.bankAccountNumber")}
            {...form.getInputProps("bankAccountNumber")}
          />
          <TextInput
            label={tr("master.ownCompanies.bankAccountHolder")}
            {...form.getInputProps("bankAccountHolder")}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
