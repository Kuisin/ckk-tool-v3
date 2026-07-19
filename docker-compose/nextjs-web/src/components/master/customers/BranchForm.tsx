"use client";

/**
 * BranchForm.tsx — 支店 新規作成 / 編集フォーム（顧客配下、2 階層まで）.
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
import {
  type BranchInput,
  createBranch,
  updateBranch,
} from "@/app/(dashboard)/master/customers/actions";
import {
  BpBaseFields,
  bpBaseFormSchema,
  bpBaseInitialValues,
} from "@/components/master/bp/BpBaseFields";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/customers";

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
    const input: BranchInput = values;
    startTransition(async () => {
      const result = isEdit
        ? await updateBranch(parentId, initial.id, input)
        : await createBranch(parentId, input);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "支店を更新しました" : "支店を作成しました",
          color: "green",
        });
        router.push(`${BASE_PATH}/${parentId}/branches/${result.data.id}`);
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
        { label: parentName, href: `${BASE_PATH}/${parentId}` },
        isEdit ? "支店 編集" : "支店 新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(
          isEdit
            ? `${BASE_PATH}/${parentId}/branches/${initial.id}`
            : `${BASE_PATH}/${parentId}`,
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
          description="支店の主担当者を同時に登録できます（任意）。"
          title="担当者"
        >
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <TextInput
              label="担当者名"
              placeholder="山田 太郎"
              {...form.getInputProps("contactName")}
            />
          </SimpleGrid>
        </FormSection>
      )}
    </FormShell>
  );
}
