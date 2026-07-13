"use client";

/**
 * ApprovalGroupForm.tsx — 承認グループ 新規作成 / 編集フォーム (MS1A / MS2A).
 *
 * 種別（type）はグループの識別 — 作成時のみ選択でき、編集では変更不可。
 * メンバーは詳細画面の「メンバー」タブで管理する（design.md §13.5）。
 */

import { Select, SimpleGrid, Switch } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import {
  createApprovalGroup,
  updateApprovalGroup,
} from "@/app/(dashboard)/master/approval-groups/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { APPROVAL_GROUP_TYPE_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/approval-groups";

const groupSchema = z.object({
  type: z.enum(["FIRST", "SECOND", "WORKFLOW_CHANGE"], {
    message: "種別を選択してください",
  }),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof groupSchema>;

export interface ApprovalGroupFormInitial {
  id: number;
  type: string;
  nameJa: string;
  nameEn: string;
  isActive: boolean;
}

export function ApprovalGroupForm({
  initial,
}: {
  initial?: ApprovalGroupFormInitial;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(groupSchema),
    initialValues: {
      type: (initial?.type as FormValues["type"]) ?? "FIRST",
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      isActive: initial?.isActive ?? true,
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const input = {
        nameJa: values.nameJa,
        nameEn: values.nameEn,
        isActive: values.isActive,
      };
      const result = isEdit
        ? await updateApprovalGroup(initial.id, input)
        : await createApprovalGroup({ ...input, type: values.type });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit
            ? "承認グループを更新しました"
            : "承認グループを作成しました",
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
        { label: "承認グループ", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={
        isEdit
          ? `承認グループ 編集 — ${initial.nameJa}`
          : "承認グループ 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select
            data={APPROVAL_GROUP_TYPE_OPTIONS}
            description={isEdit ? "種別は作成後変更できません" : undefined}
            disabled={isEdit}
            label="種別"
            withAsterisk={!isEdit}
            {...form.getInputProps("type")}
          />
        </SimpleGrid>
        <SimpleGrid cols={1} mt="sm" spacing="sm">
          <LocalizedTextInput
            enProps={form.getInputProps("nameEn")}
            jaProps={form.getInputProps("nameJa")}
            label="名称"
            required
          />
          <Switch
            label="有効"
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
