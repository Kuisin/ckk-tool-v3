"use client";

/**
 * BpForm.tsx — 取引先 新規作成 / 編集フォーム (MS11 / MS21).
 *
 * 法人基本情報（BpBaseFields 共通）+ ロール付与 + ロール別の情報。
 * ロールのチェックを入れると、そのロールの入力セクションが現れる。外すと
 * 割当は無効化されるが入力済みの内容は消えないので、付け直せば元に戻る。
 * BP コードは保存時に自動採番（BP-NNNNN）。
 */

import {
  Checkbox,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import type { BpDetail } from "@/app/(dashboard)/master/_shared/bp-data";
import { BP_BASE_PATH } from "@/app/(dashboard)/master/_shared/bp-paths";
import type { BpInput } from "@/app/(dashboard)/master/_shared/bp-schema";
import {
  createBusinessPartner,
  updateBusinessPartner,
} from "@/app/(dashboard)/master/business-partners/actions";
import {
  BpBaseFields,
  bpBaseFormSchema,
  bpBaseInitialValues,
} from "@/components/master/bp/BpBaseFields";
import { SalesRepsEditor } from "@/components/master/bp/SalesRepsEditor";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  bankAccountTypeOptions,
  bpRoleLabel,
  invoiceMethodOptions,
  taxTypeOptions,
  vendorTypeOptions,
} from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import type { Option } from "@/lib/mock";

/** 空欄を許す数値入力（Mantine の NumberInput は "" を返す）。 */
const optionalNumber = z.union([z.number(), z.literal("")]);

const bpFormSchema = bpBaseFormSchema
  .extend({
    roles: z.array(z.string()),
    customer: z.object({
      customerCode: z.string(),
      billingBpId: z.string().nullable(),
      closingDay: optionalNumber,
      paymentTermsDays: optionalNumber,
      paymentDay: optionalNumber,
      creditLimit: optionalNumber,
      taxType: z.string(),
      invoiceMethod: z.string(),
      isConsignment: z.boolean(),
      salesReps: z.array(
        z.object({ userId: z.string(), isPrimary: z.boolean() }),
      ),
    }),
    endUser: z.object({ industry: z.string() }),
    vendor: z.object({
      vendorCode: z.string(),
      vendorType: z.string(),
      closingDay: optionalNumber,
      paymentTermsDays: optionalNumber,
      paymentDay: optionalNumber,
      leadTimeDays: optionalNumber,
      bankName: z.string(),
      bankBranch: z.string(),
      bankAccountType: z.string().nullable(),
      bankAccountNumber: z.string(),
    }),
  })
  .superRefine((v, ctx) => {
    const tr = useTranslations();
    if (v.roles.includes("VENDOR") && !v.vendor.vendorType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vendor", "vendorType"],
        message: tr("master.businessPartners.selectASubcontractorType"),
      });
    }
    if (!v.roles.includes("CUSTOMER")) return;
    const ids = v.customer.salesReps.map((r) => r.userId);
    if (ids.some((id) => !id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customer", "salesReps"],
        message: tr("master.businessPartners.chooseTheSalesRepBlankRows"),
      });
    } else if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customer", "salesReps"],
        message: tr("master.businessPartners.theSameContactAppearsTwice"),
      });
    }
  });

type FormValues = z.infer<typeof bpFormSchema>;

const ROLE_ORDER = ["CUSTOMER", "END_USER", "VENDOR"] as const;

const nullIfBlank = (v: number | "") => (v === "" ? null : v);

export function BpForm({
  initial,
  billingOptions,
  salesRepOptions,
}: {
  initial?: BpDetail;
  billingOptions: Option[];
  /** 営業担当に選べるユーザー（有効な社員アカウント）。 */
  salesRepOptions: Option[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;
  const ROLE_DESCRIPTION: Record<string, string> = {
    CUSTOMER: tr("master.bpForm.customerRoleDescription"),
    END_USER: tr("master.bpForm.endUserRoleDescription"),
    VENDOR: tr("master.bpForm.vendorRoleDescription"),
  };

  const form = useForm<FormValues>({
    validate: zodResolver(bpFormSchema),
    initialValues: {
      ...bpBaseInitialValues(initial),
      roles: initial?.roles ?? [],
      customer: {
        customerCode: initial?.customer?.customerCode ?? "",
        billingBpId: initial?.customer?.billingBpId ?? null,
        closingDay: initial?.customer?.closingDay ?? "",
        paymentTermsDays: initial?.customer?.paymentTermsDays ?? "",
        paymentDay: initial?.customer?.paymentDay ?? "",
        creditLimit: initial?.customer?.creditLimit ?? "",
        taxType: initial?.customer?.taxType ?? "TAXABLE",
        invoiceMethod: initial?.customer?.invoiceMethod ?? "EMAIL",
        isConsignment: initial?.customer?.isConsignment ?? false,
        salesReps:
          initial?.customer?.salesReps.map((r) => ({
            userId: r.userId,
            isPrimary: r.isPrimary,
          })) ?? [],
      },
      endUser: { industry: initial?.endUser?.industry ?? "" },
      vendor: {
        vendorCode: initial?.vendor?.vendorCode ?? "",
        vendorType: initial?.vendor?.vendorType ?? "OUTSOURCE",
        closingDay: initial?.vendor?.closingDay ?? "",
        paymentTermsDays: initial?.vendor?.paymentTermsDays ?? "",
        paymentDay: initial?.vendor?.paymentDay ?? "",
        leadTimeDays: initial?.vendor?.leadTimeDays ?? "",
        bankName: initial?.vendor?.bankName ?? "",
        bankBranch: initial?.vendor?.bankBranch ?? "",
        bankAccountType: initial?.vendor?.bankAccountType ?? null,
        bankAccountNumber: initial?.vendor?.bankAccountNumber ?? "",
      },
    },
  });

  const roles = form.values.roles;
  const has = (role: string) => roles.includes(role);

  const handleSubmit = (values: FormValues) => {
    const input: BpInput = {
      nameJa: values.nameJa,
      nameTranslations: values.nameTranslations,
      nameKana: values.nameKana,
      shortName: values.shortName,
      countryCode: values.countryCode,
      postalCode: values.postalCode,
      addressJa: values.addressJa,
      addressTranslations: values.addressTranslations,
      phone: values.phone,
      fax: values.fax,
      email: values.email,
      website: values.website,
      taxNumber: values.taxNumber,
      documentLocale: values.documentLocale as BpInput["documentLocale"],
      matchNames: values.matchNames,
      isActive: values.isActive,
      notes: values.notes,
      roles: values.roles as BpInput["roles"],
      customer: values.roles.includes("CUSTOMER")
        ? {
            customerCode: values.customer.customerCode,
            billingBpId: values.customer.billingBpId,
            closingDay: nullIfBlank(values.customer.closingDay),
            paymentTermsDays: nullIfBlank(values.customer.paymentTermsDays),
            paymentDay: nullIfBlank(values.customer.paymentDay),
            creditLimit: nullIfBlank(values.customer.creditLimit),
            taxType: values.customer.taxType as NonNullable<
              BpInput["customer"]
            >["taxType"],
            invoiceMethod: values.customer.invoiceMethod as NonNullable<
              BpInput["customer"]
            >["invoiceMethod"],
            isConsignment: values.customer.isConsignment,
            salesReps: values.customer.salesReps,
          }
        : null,
      endUser: values.roles.includes("END_USER")
        ? { industry: values.endUser.industry }
        : null,
      vendor: values.roles.includes("VENDOR")
        ? {
            vendorCode: values.vendor.vendorCode,
            vendorType: values.vendor.vendorType as NonNullable<
              BpInput["vendor"]
            >["vendorType"],
            closingDay: nullIfBlank(values.vendor.closingDay),
            paymentTermsDays: nullIfBlank(values.vendor.paymentTermsDays),
            paymentDay: nullIfBlank(values.vendor.paymentDay),
            leadTimeDays: nullIfBlank(values.vendor.leadTimeDays),
            bankName: values.vendor.bankName,
            bankBranch: values.vendor.bankBranch,
            bankAccountType: values.vendor.bankAccountType,
            bankAccountNumber: values.vendor.bankAccountNumber,
          }
        : null,
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateBusinessPartner(initial.id, input)
        : await createBusinessPartner(input);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? tr("master.bpForm.updatedMessage")
            : tr("master.businessPartners.theBusinessPartnerWasCreated"),
          color: "green",
        });
        router.push(`${BP_BASE_PATH}/${result.data.id}`);
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
        { label: tr("common.businessPartners"), href: BP_BASE_PATH },
        isEdit ? tr("common.edit2") : tr("common.new2"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BP_BASE_PATH}/${initial.id}` : BP_BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={
        isEdit
          ? tr("master.bpForm.editTitle", { code: initial.bpCode })
          : tr("master.businessPartners.newBusinessPartner")
      }
    >
      <BpBaseFields
        bpCode={initial?.bpCode}
        codeDescription={tr(
          "master.businessPartners.formatBpNnnnnNumberedAutomatically",
        )}
        form={form}
      />

      <FormSection
        description={tr(
          "master.businessPartners.chooseInWhatCapacityThisPartner",
        )}
        title={tr("common.role")}
      >
        <Checkbox.Group {...form.getInputProps("roles")}>
          <Stack gap="xs">
            {ROLE_ORDER.map((role) => (
              <Checkbox
                description={ROLE_DESCRIPTION[role]}
                key={role}
                label={bpRoleLabel(role, locale)}
                value={role}
              />
            ))}
          </Stack>
        </Checkbox.Group>
        {roles.length === 0 && (
          <Text c="dimmed" mt="sm" size="xs">
            {tr("master.businessPartners.youCanRegisterItWithNo")}
          </Text>
        )}
      </FormSection>

      {has("CUSTOMER") && (
        <FormSection
          description={tr(
            "master.businessPartners.closingDayPaymentTermsAndInvoice",
          )}
          title={tr("master.businessPartners.customerInformation")}
        >
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput
              label={tr("common.legacySystemCode")}
              placeholder={tr(
                "master.businessPartners.legacyCustomerCodeOptional",
              )}
              {...form.getInputProps("customer.customerCode")}
            />
            <Select
              clearable
              data={billingOptions}
              label={
                <HelpLabel {...fieldHelp(tr, "businessPartner", "billingBp")} />
              }
              placeholder={tr("master.businessPartners.billThisPartnerItself")}
              searchable
              {...form.getInputProps("customer.billingBpId")}
            />
            <NumberInput
              description={tr("master.businessPartners.n31EndOfMonth")}
              label={
                <HelpLabel
                  {...fieldHelp(tr, "businessPartner", "paymentTerms", {
                    label: tr("common.closingDay"),
                  })}
                />
              }
              max={31}
              min={1}
              {...form.getInputProps("customer.closingDay")}
            />
            <NumberInput
              label={
                <HelpLabel
                  {...fieldHelp(tr, "businessPartner", "paymentTerms", {
                    label: tr("master.businessPartners.paymentTermsDays"),
                  })}
                />
              }
              min={0}
              {...form.getInputProps("customer.paymentTermsDays")}
            />
            <NumberInput
              label={
                <HelpLabel
                  {...fieldHelp(tr, "businessPartner", "paymentTerms", {
                    label: tr("common.paymentDay"),
                  })}
                />
              }
              max={31}
              min={1}
              {...form.getInputProps("customer.paymentDay")}
            />
            <NumberInput
              label={
                <HelpLabel
                  {...fieldHelp(tr, "businessPartner", "creditLimit")}
                />
              }
              min={0}
              prefix="¥"
              thousandSeparator=","
              {...form.getInputProps("customer.creditLimit")}
            />
            <Select
              data={taxTypeOptions(locale)}
              label={
                <HelpLabel {...fieldHelp(tr, "businessPartner", "taxType")} />
              }
              {...form.getInputProps("customer.taxType")}
            />
            <Select
              data={invoiceMethodOptions(locale)}
              label={
                <HelpLabel
                  {...fieldHelp(tr, "businessPartner", "invoiceMethod")}
                />
              }
              {...form.getInputProps("customer.invoiceMethod")}
            />
          </SimpleGrid>
          <Checkbox
            label={
              <HelpLabel
                {...fieldHelp(tr, "businessPartner", "consignment", {
                  label: tr(
                    "master.businessPartners.consigneeForConsignmentSales",
                  ),
                })}
              />
            }
            mt="sm"
            {...form.getInputProps("customer.isConsignment", {
              type: "checkbox",
            })}
          />
        </FormSection>
      )}

      {has("CUSTOMER") && (
        <FormSection
          description={tr(
            "master.businessPartners.theSalesRepsForThisCustomer",
          )}
          title={tr("common.salesRep")}
        >
          <SalesRepsEditor
            error={form.errors["customer.salesReps"] as string | undefined}
            onChange={(rows) => form.setFieldValue("customer.salesReps", rows)}
            options={salesRepOptions}
            value={form.values.customer.salesReps}
          />
        </FormSection>
      )}

      {has("END_USER") && (
        <FormSection
          description={tr(
            "master.businessPartners.endUserSpecificAttributesBpEnd",
          )}
          title={tr("master.businessPartners.endUserInformation")}
        >
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput
              label={
                <HelpLabel {...fieldHelp(tr, "businessPartner", "industry")} />
              }
              placeholder={tr("master.businessPartners.automotiveParts")}
              {...form.getInputProps("endUser.industry")}
            />
          </SimpleGrid>
        </FormSection>
      )}

      {has("VENDOR") && (
        <>
          <FormSection
            description={tr(
              "master.businessPartners.typePaymentTermsAndStandardLead",
            )}
            title={tr(
              "master.businessPartners.supplierAndSubcontractorInformation",
            )}
          >
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Select
                data={vendorTypeOptions(locale)}
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "businessPartner", "vendorType")}
                  />
                }
                withAsterisk
                {...form.getInputProps("vendor.vendorType")}
              />
              <TextInput
                label={tr("common.legacySystemCode")}
                placeholder={tr(
                  "master.businessPartners.legacySupplierCodeOptional",
                )}
                {...form.getInputProps("vendor.vendorCode")}
              />
              <NumberInput
                description={tr("master.businessPartners.n31EndOfMonth")}
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "businessPartner", "paymentTerms", {
                      label: tr("common.closingDay"),
                    })}
                  />
                }
                max={31}
                min={1}
                {...form.getInputProps("vendor.closingDay")}
              />
              <NumberInput
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "businessPartner", "paymentTerms", {
                      label: tr("master.businessPartners.paymentTermsDays"),
                    })}
                  />
                }
                min={0}
                {...form.getInputProps("vendor.paymentTermsDays")}
              />
              <NumberInput
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "businessPartner", "paymentTerms", {
                      label: tr("common.paymentDay"),
                    })}
                  />
                }
                max={31}
                min={1}
                {...form.getInputProps("vendor.paymentDay")}
              />
              <NumberInput
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "businessPartner", "leadTime")}
                  />
                }
                min={0}
                {...form.getInputProps("vendor.leadTimeDays")}
              />
            </SimpleGrid>
          </FormSection>

          <FormSection
            description={tr("master.businessPartners.bankAccountForPayments")}
            title={tr("common.bankAccount")}
          >
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <TextInput
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "businessPartner", "bank", {
                      label: tr("common.bankName"),
                    })}
                  />
                }
                placeholder={tr("master.businessPartners.exampleBank")}
                {...form.getInputProps("vendor.bankName")}
              />
              <TextInput
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "businessPartner", "bank", {
                      label: tr("common.branchName"),
                    })}
                  />
                }
                placeholder={tr("master.businessPartners.exampleBranch")}
                {...form.getInputProps("vendor.bankBranch")}
              />
              <Select
                clearable
                data={bankAccountTypeOptions(locale)}
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "businessPartner", "bank", {
                      label: tr("common.accountType"),
                    })}
                  />
                }
                {...form.getInputProps("vendor.bankAccountType")}
              />
              <TextInput
                label={
                  <HelpLabel
                    {...fieldHelp(tr, "businessPartner", "bank", {
                      label: tr("common.accountNumber"),
                    })}
                  />
                }
                placeholder="1234567"
                {...form.getInputProps("vendor.bankAccountNumber")}
              />
            </SimpleGrid>
          </FormSection>
        </>
      )}
    </FormShell>
  );
}
