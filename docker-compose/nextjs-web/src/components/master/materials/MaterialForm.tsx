"use client";

/**
 * MaterialForm.tsx — 素材 新規作成 / 編集フォーム (MS15 / MS25).
 *
 * Ported from design-preview (designs/master/materials/new.tsx, edit.tsx) and
 * wired to the create/update Server Actions.
 */

import { Select, SimpleGrid, Switch, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import {
  createMaterial,
  updateMaterial,
} from "@/app/(dashboard)/master/materials/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { MATERIAL_FORM_OPTIONS, UNIT_OPTIONS } from "@/lib/enum-labels";
import { zodResolver } from "@/lib/form";
import type { Option } from "@/lib/mock";

const BASE_PATH = "/master/materials";

const materialSchema = z.object({
  code: z
    .string()
    .regex(
      /^[A-Z][0-9]{2}[A-Z][0-9]{4}-[A-C][0-9]{3}-[0-9]{3}$/,
      "形式は [材種]-[A-C][0-9]{3}-[0-9]{3} で入力してください",
    ),
  materialTypeId: z.string().min(1, "材種を選択してください"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string(),
  unit: z.string().min(1, "単位を選択してください"),
  form: z.enum(["POLISHED", "STANDARD_LENGTH", "SEMI_FINISHED", "OTHER"]),
  isActive: z.boolean(),
  notes: z.string(),
});

type FormValues = z.infer<typeof materialSchema>;

export interface MaterialFormInitial {
  id: string;
  materialTypeId: string;
  nameJa: string;
  nameEn: string;
  unit: string;
  form: FormValues["form"];
  isActive: boolean;
  notes: string;
}

export function MaterialForm({
  initial,
  typeOptions,
}: {
  initial?: MaterialFormInitial;
  typeOptions: Option[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(materialSchema),
    initialValues: {
      code: initial?.id ?? "",
      materialTypeId: initial?.materialTypeId ?? "",
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      unit: initial?.unit ?? "本",
      form: initial?.form ?? "POLISHED",
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateMaterial(initial.id, values)
        : await createMaterial(values);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "素材を更新しました" : "素材を作成しました",
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
        { label: "素材", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={isEdit ? `素材 編集 — ${initial.id}` : "素材 新規作成"}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} mb="sm" spacing="sm">
          <TextInput
            description="形式: [材種]-[A-C][0-9]{3}-[0-9]{3}"
            disabled={isEdit}
            label="素材コード"
            placeholder="A01A0001-A001-001"
            withAsterisk={!isEdit}
            {...form.getInputProps("code")}
          />
          <Select
            data={typeOptions}
            label="材種"
            placeholder="材種を選択"
            searchable
            withAsterisk
            {...form.getInputProps("materialTypeId")}
          />
          <Select
            data={UNIT_OPTIONS}
            label="単位"
            withAsterisk
            {...form.getInputProps("unit")}
          />
          <Select
            data={MATERIAL_FORM_OPTIONS}
            label="形態"
            withAsterisk
            {...form.getInputProps("form")}
          />
        </SimpleGrid>
        <LocalizedTextInput
          enProps={form.getInputProps("nameEn")}
          jaProps={form.getInputProps("nameJa")}
          label="名称"
          placeholder="SUS303 φ20×3000"
          required
        />
        <Switch
          label="有効"
          mt="md"
          {...form.getInputProps("isActive", { type: "checkbox" })}
        />
        <Textarea
          label="備考"
          mt="sm"
          placeholder="備考・特記事項"
          rows={3}
          {...form.getInputProps("notes")}
        />
      </FormSection>
    </FormShell>
  );
}
