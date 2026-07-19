"use client";

/**
 * CustomerForm.tsx — 顧客 新規作成 / 編集フォーム (MS11 / MS21).
 *
 * 法人基本情報（BpBaseFields 共通）+ 取引条件（bp_customer_attrs）。
 * BP コードは保存時に自動採番（BP-NNNNN）。
 */

import {
  Checkbox,
  NumberInput,
  Select,
  SimpleGrid,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import type {
  BpBaseDetail,
  CustomerAttrs,
} from "@/app/(dashboard)/master/_shared/bp-data";
import {
  type CustomerInput,
  createCustomer,
  updateCustomer,
} from "@/app/(dashboard)/master/customers/actions";
import {
  BpBaseFields,
  bpBaseFormSchema,
  bpBaseInitialValues,
} from "@/components/master/bp/BpBaseFields";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { INVOICE_METHOD_OPTIONS, TAX_TYPE_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import type { Option } from "@/lib/mock";

const BASE_PATH = "/master/customers";

const customerFormSchema = bpBaseFormSchema.extend({
  customerCode: z.string(),
  billingBpId: z.string().nullable(),
  closingDay: z.union([z.number(), z.literal("")]),
  paymentTermsDays: z.union([z.number(), z.literal("")]),
  paymentDay: z.union([z.number(), z.literal("")]),
  creditLimit: z.union([z.number(), z.literal("")]),
  taxType: z.string(),
  invoiceMethod: z.string(),
  isConsignment: z.boolean(),
});

type FormValues = z.infer<typeof customerFormSchema>;

export interface CustomerFormInitial {
  base: BpBaseDetail;
  attrs: CustomerAttrs;
}

export function CustomerForm({
  initial,
  billingOptions,
}: {
  initial?: CustomerFormInitial;
  billingOptions: Option[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(customerFormSchema),
    initialValues: {
      ...bpBaseInitialValues(initial?.base),
      customerCode: initial?.attrs.customerCode ?? "",
      billingBpId: initial?.attrs.billingBpId ?? null,
      closingDay: initial?.attrs.closingDay ?? "",
      paymentTermsDays: initial?.attrs.paymentTermsDays ?? "",
      paymentDay: initial?.attrs.paymentDay ?? "",
      creditLimit: initial?.attrs.creditLimit ?? "",
      taxType: initial?.attrs.taxType ?? "TAXABLE",
      invoiceMethod: initial?.attrs.invoiceMethod ?? "EMAIL",
      isConsignment: initial?.attrs.isConsignment ?? false,
    },
  });

  const handleSubmit = (values: FormValues) => {
    const input: CustomerInput = {
      ...values,
      countryCode: values.countryCode,
      attrs: {
        customerCode: values.customerCode,
        billingBpId: values.billingBpId,
        closingDay: values.closingDay === "" ? null : values.closingDay,
        paymentTermsDays:
          values.paymentTermsDays === "" ? null : values.paymentTermsDays,
        paymentDay: values.paymentDay === "" ? null : values.paymentDay,
        creditLimit: values.creditLimit === "" ? null : values.creditLimit,
        taxType: values.taxType as CustomerInput["attrs"]["taxType"],
        invoiceMethod:
          values.invoiceMethod as CustomerInput["attrs"]["invoiceMethod"],
        isConsignment: values.isConsignment,
      },
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateCustomer(initial.base.id, input)
        : await createCustomer(input);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "顧客を更新しました" : "顧客を作成しました",
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
        { label: "顧客", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.base.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={
        isEdit ? <ActiveBadge active={initial.base.isActive} /> : undefined
      }
      title={isEdit ? `顧客 編集 — ${initial.base.bpCode}` : "顧客 新規作成"}
    >
      <BpBaseFields
        bpCode={initial?.base.bpCode}
        codeDescription="形式: BP-NNNNN（自動採番）"
        form={form}
      />

      <FormSection
        description="締日・支払条件・請求方法（bp_customer_attrs）。"
        title="取引条件"
      >
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label="旧システムコード"
            placeholder="旧顧客コード（任意）"
            {...form.getInputProps("customerCode")}
          />
          <Select
            clearable
            data={billingOptions}
            label="請求先（別法人の場合）"
            placeholder="この顧客自身に請求"
            searchable
            {...form.getInputProps("billingBpId")}
          />
          <NumberInput
            description="31 = 月末"
            label="締日"
            max={31}
            min={1}
            {...form.getInputProps("closingDay")}
          />
          <NumberInput
            label="支払サイト（日数）"
            min={0}
            {...form.getInputProps("paymentTermsDays")}
          />
          <NumberInput
            label="支払日"
            max={31}
            min={1}
            {...form.getInputProps("paymentDay")}
          />
          <NumberInput
            label="与信限度額"
            min={0}
            prefix="¥"
            thousandSeparator=","
            {...form.getInputProps("creditLimit")}
          />
          <Select
            data={TAX_TYPE_OPTIONS}
            label="課税区分"
            {...form.getInputProps("taxType")}
          />
          <Select
            data={INVOICE_METHOD_OPTIONS}
            label="請求書送付方法"
            {...form.getInputProps("invoiceMethod")}
          />
        </SimpleGrid>
        <Checkbox
          label="委託先（委託販売の対象）"
          mt="sm"
          {...form.getInputProps("isConsignment", { type: "checkbox" })}
        />
      </FormSection>
    </FormShell>
  );
}
