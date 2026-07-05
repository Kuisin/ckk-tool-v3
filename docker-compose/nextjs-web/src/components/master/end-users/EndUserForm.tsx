"use client";

/**
 * EndUserForm.tsx — 最終需要家 新規作成 / 編集フォーム (MS12 / MS22).
 *
 * 法人基本情報（BpBaseFields 共通）+ 業種（bp_end_user_attrs）。
 */

import { SimpleGrid, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import type { EndUserDetail } from "@/app/(dashboard)/master/_shared/bp-data";
import {
  createEndUser,
  updateEndUser,
} from "@/app/(dashboard)/master/end-users/actions";
import {
  BpBaseFields,
  bpBaseFormSchema,
  bpBaseInitialValues,
} from "@/components/master/bp/BpBaseFields";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { FormSection, FormShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/end-users";

const endUserFormSchema = bpBaseFormSchema.extend({
  industry: z.string(),
});

type FormValues = z.infer<typeof endUserFormSchema>;

export function EndUserForm({ initial }: { initial?: EndUserDetail }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(endUserFormSchema),
    initialValues: {
      ...bpBaseInitialValues(initial),
      industry: initial?.industry ?? "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateEndUser(initial.id, values)
        : await createEndUser(values);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit
            ? "最終需要家を更新しました"
            : "最終需要家を作成しました",
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
        { label: "最終需要家", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={
        isEdit ? `最終需要家 編集 — ${initial.bpCode}` : "最終需要家 新規作成"
      }
    >
      <BpBaseFields
        bpCode={initial?.bpCode}
        codeDescription="形式: BP-NNNNN（自動採番）"
        form={form}
      />

      <FormSection
        description="需要家固有属性（bp_end_user_attrs）。"
        title="需要家情報"
      >
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label="業種"
            placeholder="自動車部品"
            {...form.getInputProps("industry")}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
