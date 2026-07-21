"use client";

/**
 * SupplierForm.tsx — 外注企業 新規作成 / 編集フォーム (MS16 / MS26).
 *
 * 法人基本情報（BpBaseFields 共通）+ 取引条件・振込先（bp_vendor_attrs）。
 */

import { NumberInput, Select, SimpleGrid, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import type {
  BpBaseDetail,
  SupplierAttrs,
} from "@/app/(dashboard)/master/_shared/bp-data";
import {
  createSupplier,
  type SupplierInput,
  updateSupplier,
} from "@/app/(dashboard)/master/suppliers/actions";
import {
  BpBaseFields,
  bpBaseFormSchema,
  bpBaseInitialValues,
} from "@/components/master/bp/BpBaseFields";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  BANK_ACCOUNT_TYPE_OPTIONS,
  VENDOR_TYPE_OPTIONS,
} from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/suppliers";

const supplierFormSchema = bpBaseFormSchema.extend({
  vendorCode: z.string(),
  vendorType: z.string().min(1, "外注種別を選択してください"),
  closingDay: z.union([z.number(), z.literal("")]),
  paymentTermsDays: z.union([z.number(), z.literal("")]),
  paymentDay: z.union([z.number(), z.literal("")]),
  leadTimeDays: z.union([z.number(), z.literal("")]),
  bankName: z.string(),
  bankBranch: z.string(),
  bankAccountType: z.string().nullable(),
  bankAccountNumber: z.string(),
});

type FormValues = z.infer<typeof supplierFormSchema>;

export interface SupplierFormInitial {
  base: BpBaseDetail;
  attrs: SupplierAttrs;
}

export function SupplierForm({ initial }: { initial?: SupplierFormInitial }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(supplierFormSchema),
    initialValues: {
      ...bpBaseInitialValues(initial?.base),
      vendorCode: initial?.attrs.vendorCode ?? "",
      vendorType: initial?.attrs.vendorType ?? "OUTSOURCE",
      closingDay: initial?.attrs.closingDay ?? "",
      paymentTermsDays: initial?.attrs.paymentTermsDays ?? "",
      paymentDay: initial?.attrs.paymentDay ?? "",
      leadTimeDays: initial?.attrs.leadTimeDays ?? "",
      bankName: initial?.attrs.bankName ?? "",
      bankBranch: initial?.attrs.bankBranch ?? "",
      bankAccountType: initial?.attrs.bankAccountType ?? null,
      bankAccountNumber: initial?.attrs.bankAccountNumber ?? "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    const input: SupplierInput = {
      ...values,
      attrs: {
        vendorCode: values.vendorCode,
        vendorType: values.vendorType as SupplierInput["attrs"]["vendorType"],
        closingDay: values.closingDay === "" ? null : values.closingDay,
        paymentTermsDays:
          values.paymentTermsDays === "" ? null : values.paymentTermsDays,
        paymentDay: values.paymentDay === "" ? null : values.paymentDay,
        leadTimeDays: values.leadTimeDays === "" ? null : values.leadTimeDays,
        bankName: values.bankName,
        bankBranch: values.bankBranch,
        bankAccountType: values.bankAccountType,
        bankAccountNumber: values.bankAccountNumber,
      },
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateSupplier(initial.base.id, input)
        : await createSupplier(input);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "外注企業を更新しました" : "外注企業を作成しました",
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
        { label: "外注企業", href: BASE_PATH },
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
      title={
        isEdit ? `外注企業 編集 — ${initial.base.bpCode}` : "外注企業 新規作成"
      }
    >
      <BpBaseFields
        bpCode={initial?.base.bpCode}
        codeDescription="形式: BP-NNNNN（自動採番）"
        form={form}
      />

      <FormSection
        description="種別・支払条件・標準リードタイム（bp_vendor_attrs）。"
        title="取引条件"
      >
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select
            data={VENDOR_TYPE_OPTIONS}
            label="外注種別"
            withAsterisk
            {...form.getInputProps("vendorType")}
          />
          <TextInput
            label="旧システムコード"
            placeholder="旧仕入先コード（任意）"
            {...form.getInputProps("vendorCode")}
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
            label="標準リードタイム（日数）"
            min={0}
            {...form.getInputProps("leadTimeDays")}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection description="支払振込先の口座情報。" title="振込先">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label="銀行名"
            placeholder="〇〇銀行"
            {...form.getInputProps("bankName")}
          />
          <TextInput
            label="支店名"
            placeholder="〇〇支店"
            {...form.getInputProps("bankBranch")}
          />
          <Select
            clearable
            data={BANK_ACCOUNT_TYPE_OPTIONS}
            label="口座種別"
            {...form.getInputProps("bankAccountType")}
          />
          <TextInput
            label="口座番号"
            placeholder="1234567"
            {...form.getInputProps("bankAccountNumber")}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
