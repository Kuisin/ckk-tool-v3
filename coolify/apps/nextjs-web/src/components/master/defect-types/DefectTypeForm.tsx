"use client";

/**
 * DefectTypeForm.tsx — 不良種類 新規作成フォーム (MS1A).
 *
 * 詳細ページを持たないマスタのため、保存後は一覧へ戻る（編集は一覧の
 * モーダルで行う）。
 */

import {
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import { createDefectType } from "@/app/(dashboard)/master/defect-types/actions";
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

const BASE_PATH = "/master/defect-types";

const defectTypeSchema = z.object({
  code: z.string().min(1, "コードを入力してください"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameTranslations: z.record(z.string(), z.string()).default({}),
  sortOrder: z.number().int("表示順は整数で入力してください").min(0),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof defectTypeSchema>;

export function DefectTypeForm() {
  const tr = useTr();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(defectTypeSchema),
    initialValues: {
      code: "",
      nameJa: "",
      nameTranslations: {},
      sortOrder: 0,
      isActive: true,
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await createDefectType(values);
      if (result.ok) {
        notifications.show({
          title: tr("保存しました"),
          message: tr("不良種類を作成しました"),
          color: "green",
        });
        // 詳細ページがないため一覧へ戻る。
        router.push(BASE_PATH);
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
        { label: "不良種類", href: BASE_PATH },
        tr("新規作成"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={form.onSubmit(handleSubmit)}
      title={tr("不良種類 新規作成")}
    >
      <FormSection title={tr("基本情報")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={tr("不良種類を識別する一意のコード")}
            label={
              <HelpLabel
                {...fieldHelp("defectType", "code", { label: "コード" })}
              />
            }
            placeholder={tr("例: SCRATCH")}
            withAsterisk
            {...form.getInputProps("code")}
          />
          <NumberInput
            allowDecimal={false}
            description={tr("一覧・不良入力での並び順")}
            label={<HelpLabel {...fieldHelp("defectType", "sortOrder")} />}
            min={0}
            {...form.getInputProps("sortOrder")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip("defectType", "code")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("名称")}
            required
            translationsProps={form.getInputProps("nameTranslations")}
          />
          <Switch
            label={<HelpLabel {...fieldHelp("defectType", "active")} />}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </Stack>
      </FormSection>
    </FormShell>
  );
}
