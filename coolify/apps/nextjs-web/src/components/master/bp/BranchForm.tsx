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
import { useTranslations } from "next-intl";
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
import { useIsMobile } from "@/hooks/useViewport";
import { zodResolver } from "@/lib/form";

function branchFormSchema(tr: ReturnType<typeof useTranslations>) {
  return bpBaseFormSchema(tr).extend({
    contactName: z.string(),
  });
}

type FormValues = z.infer<ReturnType<typeof branchFormSchema>>;

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
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(branchFormSchema(tr)),
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
          title: tr("common.saved2"),
          message: isEdit
            ? tr("master.branchForm.theBranchWasUpdated")
            : tr("master.bp.theBranchWasCreated"),
          color: "green",
        });
        router.push(`${BP_BASE_PATH}/${parentId}/branches/${result.data.id}`);
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
        { label: parentName, href: `${BP_BASE_PATH}/${parentId}` },
        isEdit ? tr("master.branchForm.editBranch") : tr("master.bp.newBranch"),
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
          ? tr("master.branchForm.editTitle", { code: initial.bpCode })
          : tr("master.branchForm.newTitle", { parentName })
      }
    >
      <BpBaseFields
        bpCode={initial?.bpCode}
        codeDescription={tr("master.branchForm.codeFormat", { parentBpCode })}
        form={form}
      />

      {!isEdit && (
        <FormSection
          description={tr("master.bp.youCanRegisterTheBranchS")}
          title={tr("common.assignee")}
        >
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput
              label={tr("common.contactName")}
              placeholder={tr("master.bpModals.namePlaceholder")}
              {...form.getInputProps("contactName")}
            />
          </SimpleGrid>
        </FormSection>
      )}
    </FormShell>
  );
}
