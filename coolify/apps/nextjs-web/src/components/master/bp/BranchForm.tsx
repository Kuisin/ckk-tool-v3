"use client";

/**
 * BranchForm.tsx — 支店 新規作成 / 編集フォーム（取引先配下、2 階層まで）.
 *
 * 支店コードは `親コード-NN` を保存時に自動採番。新規作成時は任意で
 * 主担当者を同時に登録できる。
 */

import { SimpleGrid, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import type { BpBaseDetail } from "@/app/(dashboard)/master/_shared/bp-data";
import { BP_BASE_PATH } from "@/app/(dashboard)/master/_shared/bp-paths";
import {
  type BranchInput,
  createBranch,
  updateBranch,
} from "@/app/(dashboard)/master/business-partners/actions";
import {
  BpBaseFields,
  bpBaseFormSchema,
  bpBaseInitialValues,
} from "@/components/master/bp/BpBaseFields";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import { zodResolver } from "@/lib/form";

const branchFormSchema = bpBaseFormSchema.extend({
  contactName: z.string(),
});

type FormValues = z.infer<typeof branchFormSchema>;

export function BranchForm({
  parentId,
  parentName,
  parentBpCode,
  initial,
}: {
  parentId: string;
  parentName: string;
  parentBpCode: string;
  initial?: BpBaseDetail;
}) {
  const tr = useTr();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(branchFormSchema),
    initialValues: {
      ...bpBaseInitialValues(initial),
      contactName: "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    const input: BranchInput = {
      ...values,
      documentLocale: values.documentLocale as BranchInput["documentLocale"],
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateBranch(parentId, initial.id, input)
        : await createBranch(parentId, input);
      if (result.ok) {
        notifications.show({
          title: tr("保存しました"),
          message: isEdit ? "支店を更新しました" : tr("支店を作成しました"),
          color: "green",
        });
        router.push(`${BP_BASE_PATH}/${parentId}/branches/${result.data.id}`);
      } else {
        notifications.show({
          title: tr("エラー"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        tr("マスタ"),
        { label: tr("取引先"), href: BP_BASE_PATH },
        { label: parentName, href: `${BP_BASE_PATH}/${parentId}` },
        isEdit ? "支店 編集" : tr("支店 新規作成"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(
          isEdit
            ? `${BP_BASE_PATH}/${parentId}/branches/${initial.id}`
            : `${BP_BASE_PATH}/${parentId}`,
        )
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={
        isEdit
          ? `支店 編集 — ${initial.bpCode}`
          : `支店 新規作成 — ${parentName}`
      }
    >
      <BpBaseFields
        bpCode={initial?.bpCode}
        codeDescription={`形式: ${parentBpCode}-NN（自動採番）`}
        form={form}
      />

      {!isEdit && (
        <FormSection
          description={tr("支店の主担当者を同時に登録できます（任意）。")}
          title={tr("担当者")}
        >
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput
              label={tr("担当者名")}
              placeholder="山田 太郎"
              {...form.getInputProps("contactName")}
            />
          </SimpleGrid>
        </FormSection>
      )}
    </FormShell>
  );
}
