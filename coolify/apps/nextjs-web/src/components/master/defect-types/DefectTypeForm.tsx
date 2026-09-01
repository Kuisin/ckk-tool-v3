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
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import { createDefectType } from "@/app/(dashboard)/master/defect-types/actions";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
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
  const tr = useTranslations();
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
          title: tr("common.saved2"),
          message: tr("master.defectTypes.theDefectTypeWasCreated"),
          color: "green",
        });
        // 詳細ページがないため一覧へ戻る。
        router.push(BASE_PATH);
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
        { label: "不良種類", href: BASE_PATH },
        tr("common.new2"),
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={form.onSubmit(handleSubmit)}
      title={tr("master.defectTypes.newDefectType")}
    >
      <FormSection title={tr("common.basicInformation")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={tr(
              "master.defectTypes.aUniqueCodeIdentifyingTheDefect",
            )}
            label={
              <HelpLabel
                {...fieldHelp("defectType", "code", { label: "コード" })}
              />
            }
            placeholder={tr("master.defectTypes.eGScratch")}
            withAsterisk
            {...form.getInputProps("code")}
          />
          <NumberInput
            allowDecimal={false}
            description={tr("master.defectTypes.orderInListsAndDefectEntry")}
            label={<HelpLabel {...fieldHelp("defectType", "sortOrder")} />}
            min={0}
            {...form.getInputProps("sortOrder")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip("defectType", "code")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("common.name2")}
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
