"use client";

/**
 * ApprovalGroupForm.tsx — 承認グループ 新規作成 / 編集フォーム (MS1B / MS2B).
 *
 * グループは承認者の集合。どの書類の何段目で使うかは承認フローが決める。
 * メンバーは詳細画面の「メンバー」タブで管理する（design.md §13.5）。
 */

import { SimpleGrid, Switch } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import {
  createApprovalGroup,
  updateApprovalGroup,
} from "@/app/(dashboard)/master/approval-settings/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/approval-settings";

const groupSchema = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameTranslations: z.record(z.string(), z.string()).default({}),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof groupSchema>;

export interface ApprovalGroupFormInitial {
  id: number;
  nameJa: string;
  nameTranslations: Record<string, string>;
  isActive: boolean;
}

export function ApprovalGroupForm({
  initial,
}: {
  initial?: ApprovalGroupFormInitial;
}) {
  const tr = useTr();
  const router = useRouter();
  const _isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(groupSchema),
    initialValues: {
      nameJa: initial?.nameJa ?? "",
      nameTranslations: initial?.nameTranslations ?? {},
      isActive: initial?.isActive ?? true,
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const input = {
        nameJa: values.nameJa,
        nameTranslations: values.nameTranslations,
        isActive: values.isActive,
      };
      const result = isEdit
        ? await updateApprovalGroup(initial.id, input)
        : await createApprovalGroup(input);
      if (result.ok) {
        notifications.show({
          title: tr("保存しました"),
          message: isEdit
            ? tr("承認グループを更新しました")
            : tr("承認グループを作成しました"),
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.id}`);
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={[
        tr("マスタ"),
        { label: tr("承認グループ"), href: BASE_PATH },
        isEdit ? "編集" : tr("新規作成"),
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
          ? `承認グループ 編集 — ${initial.nameJa}`
          : tr("承認グループ 新規作成")
      }
    >
      <FormSection
        description={tr("どの書類の何段目で使うかは「承認フロー」で決めます。")}
        title={tr("基本情報")}
      >
        <SimpleGrid cols={1} spacing="sm">
          <LocalizedTextInput
            help={fieldHelpTip("approvalGroup", "name")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("名称")}
            required
            translationsProps={form.getInputProps("nameTranslations")}
          />
          <Switch
            label={<HelpLabel {...fieldHelp("approvalGroup", "active")} />}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
