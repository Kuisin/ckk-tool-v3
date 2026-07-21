"use client";

/**
 * InspectionTemplateForm.tsx — 検査表テンプレート 新規作成 / 編集フォーム
 * (MS18 / MS28)。
 *
 * code は識別子（作成時のみ入力・編集不可）。関連工程は工程マスタから
 * サーバー検索で選択する。検査項目は詳細画面の「検査項目」タブでインライン
 * 追加・編集する（design.md §13.4 — このフォームでは扱わない）。
 */

import { SimpleGrid, Switch, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import { searchProcessStepOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createInspectionTemplate,
  updateInspectionTemplate,
} from "@/app/(dashboard)/master/inspection-templates/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/inspection-templates";

const templateSchema = z.object({
  code: z
    .string()
    .min(1, "コードを入力してください")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "コードは英数字・ハイフン・アンダースコアで入力してください",
    ),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string(),
  relatedProcessStepId: z.string().nullable(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof templateSchema>;

export interface InspectionTemplateFormInitial {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  relatedProcessStepId: string | null;
  relatedProcessStepLabel: string;
  isActive: boolean;
}

export function InspectionTemplateForm({
  initial,
}: {
  initial?: InspectionTemplateFormInitial;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(templateSchema),
    initialValues: {
      code: initial?.code ?? "",
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      relatedProcessStepId: initial?.relatedProcessStepId ?? null,
      isActive: initial?.isActive ?? true,
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const relatedProcessStepId = values.relatedProcessStepId
        ? Number(values.relatedProcessStepId)
        : null;
      const input = {
        nameJa: values.nameJa,
        nameEn: values.nameEn,
        relatedProcessStepId,
        isActive: values.isActive,
      };
      const result = isEdit
        ? await updateInspectionTemplate(initial.id, input)
        : await createInspectionTemplate({ ...input, code: values.code });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit
            ? "検査表テンプレートを更新しました"
            : "検査表テンプレートを作成しました",
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
        { label: "検査表テンプレート", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
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
          ? `検査表テンプレート 編集 — ${initial.code}`
          : "検査表テンプレート 新規作成"
      }
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={
              isEdit ? "コードは作成後変更できません" : "英数字・-・_（一意）"
            }
            disabled={isEdit}
            label="コード"
            placeholder="例: INSP-DIM-01"
            withAsterisk={!isEdit}
            {...form.getInputProps("code")}
          />
          <SearchSelect
            description="このテンプレートを既定で使う検査工程（任意）"
            initialOption={
              initial?.relatedProcessStepId
                ? {
                    value: initial.relatedProcessStepId,
                    label: initial.relatedProcessStepLabel,
                  }
                : undefined
            }
            label="関連工程"
            onChange={(value) =>
              form.setFieldValue("relatedProcessStepId", value)
            }
            onSearch={searchProcessStepOptions}
            placeholder="工程コード・名称で検索"
            storageKey="inspection-template-process-step"
            value={form.values.relatedProcessStepId}
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
