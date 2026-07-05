"use client";

/**
 * MaterialTypeForm.tsx — 材種 新規作成 / 編集フォーム (MS14 / MS24).
 *
 * Ported from design-preview (designs/master/material-types/new.tsx, edit.tsx)
 * and wired to the create/update Server Actions. After submit, navigates to
 * the record's detail page (design.md §8.3).
 */

import { SimpleGrid, Switch, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import {
  createMaterialType,
  updateMaterialType,
} from "@/app/(dashboard)/master/material-types/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/material-types";

const materialTypeSchema = z.object({
  code: z
    .string()
    .regex(
      /^[A-Z][0-9]{2}[A-Z][0-9]{4}$/,
      "形式は [A-Z][0-9]{2}[A-Z][0-9]{4} で入力してください",
    ),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string(),
  descriptionJa: z.string(),
  descriptionEn: z.string(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof materialTypeSchema>;

export interface MaterialTypeFormInitial {
  id: string;
  nameJa: string;
  nameEn: string;
  descriptionJa: string;
  descriptionEn: string;
  isActive: boolean;
}

export function MaterialTypeForm({
  initial,
}: {
  initial?: MaterialTypeFormInitial;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(materialTypeSchema),
    initialValues: {
      code: initial?.id ?? "",
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      descriptionJa: initial?.descriptionJa ?? "",
      descriptionEn: initial?.descriptionEn ?? "",
      isActive: initial?.isActive ?? true,
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateMaterialType(initial.id, values)
        : await createMaterialType(values);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "材種を更新しました" : "材種を作成しました",
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
        { label: "材種", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={isEdit ? `材種 編集 — ${initial.id}` : "材種 新規作成"}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} mb="sm" spacing="sm">
          <TextInput
            description="形式: [A-Z][0-9]{2}[A-Z][0-9]{4}"
            disabled={isEdit}
            label="材種コード"
            placeholder="A01A0001"
            withAsterisk={!isEdit}
            {...form.getInputProps("code")}
          />
          <Switch
            label="有効"
            mt={isMobile ? 0 : "xl"}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </SimpleGrid>
        <LocalizedTextInput
          enProps={form.getInputProps("nameEn")}
          jaProps={form.getInputProps("nameJa")}
          label="名称"
          placeholder="SUS303"
          required
        />
      </FormSection>

      <FormSection title="説明">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Textarea
            label="説明（日本語）"
            placeholder="材種の説明"
            rows={3}
            {...form.getInputProps("descriptionJa")}
          />
          <Textarea
            label="説明（English）"
            placeholder="Description"
            rows={3}
            {...form.getInputProps("descriptionEn")}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
