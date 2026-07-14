"use client";

/**
 * MaterialTypeForm.tsx — 材種 新規作成 / 編集フォーム (MS14 / MS24).
 *
 * 新規は「ビルダー」: メーカー → メーカー材種（メーカーで絞り込み）→ 形状 を
 * 選ぶと材種コード [メーカー][材種2桁][形状][種類4桁] のプレビューを表示。
 * 種類（4桁）は保存時に自動採番される。編集は名称・説明・有効のみ
 * （コード構成は不変。レガシー未変換の行も同じ編集フォーム）。
 */

import {
  Alert,
  Select,
  SimpleGrid,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { z } from "zod";
import {
  createMaterialType,
  updateMaterialType,
} from "@/app/(dashboard)/master/material-types/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { DocNumber } from "@/components/ui/DocNumber";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { zodResolver } from "@/lib/form";
import type { Option } from "@/lib/mock";

const BASE_PATH = "/master/material-types";

const materialTypeSchema = (isEdit: boolean) =>
  z.object({
    manufacturerCode: isEdit
      ? z.string()
      : z.string().min(1, "メーカーを選択してください"),
    gradeCode: isEdit
      ? z.string()
      : z.string().min(1, "メーカー材種を選択してください"),
    shapeCode: isEdit
      ? z.string()
      : z.string().min(1, "形状を選択してください"),
    nameJa: z.string().min(1, "名称（日本語）を入力してください"),
    nameEn: z.string(),
    descriptionJa: z.string(),
    descriptionEn: z.string(),
    isActive: z.boolean(),
  });

type FormValues = z.infer<ReturnType<typeof materialTypeSchema>>;

export interface GradeOption extends Option {
  manufacturerCode: string;
}

export interface MaterialTypeFormInitial {
  id: number;
  /** 材種コード（未変換は null）。 */
  code: string | null;
  /** 変換済のときのみ — コード構成の表示用ラベル。 */
  composition?: {
    manufacturerLabel: string;
    gradeLabel: string;
    shapeLabel: string;
    kindCode: string;
  } | null;
  nameJa: string;
  nameEn: string;
  descriptionJa: string;
  descriptionEn: string;
  isActive: boolean;
}

export function MaterialTypeForm({
  initial,
  manufacturerOptions = [],
  gradeOptions = [],
  shapeOptions = [],
}: {
  initial?: MaterialTypeFormInitial;
  manufacturerOptions?: Option[];
  gradeOptions?: GradeOption[];
  shapeOptions?: Option[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(materialTypeSchema(isEdit)),
    initialValues: {
      manufacturerCode: "",
      gradeCode: "",
      shapeCode: "",
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      descriptionJa: initial?.descriptionJa ?? "",
      descriptionEn: initial?.descriptionEn ?? "",
      isActive: initial?.isActive ?? true,
    },
  });

  const filteredGrades = useMemo(
    () =>
      gradeOptions.filter(
        (g) => g.manufacturerCode === form.values.manufacturerCode,
      ),
    [gradeOptions, form.values.manufacturerCode],
  );

  const preview = `${form.values.manufacturerCode || "?"}${
    form.values.gradeCode || "??"
  }${form.values.shapeCode || "?"}####`;

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateMaterialType(initial.id, values)
        : await createMaterialType(values);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit
            ? "材種を更新しました"
            : `材種 ${"code" in result.data ? result.data.code : ""} を作成しました`,
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
      title={
        isEdit
          ? `材種 編集 — ${initial.code ?? initial.nameJa}`
          : "材種 新規作成"
      }
    >
      {isEdit ? (
        <FormSection
          description="コード構成は作成後変更できません。"
          title="コード構成"
        >
          {initial.composition ? (
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <TextInput
                disabled
                label="メーカー"
                value={initial.composition.manufacturerLabel}
              />
              <TextInput
                disabled
                label="メーカー材種"
                value={initial.composition.gradeLabel}
              />
              <TextInput
                disabled
                label="形状"
                value={initial.composition.shapeLabel}
              />
              <TextInput
                disabled
                label="種類（自動採番）"
                value={initial.composition.kindCode}
              />
            </SimpleGrid>
          ) : (
            <Alert
              color="gray"
              icon={<IconInfoCircle size={16} />}
              variant="light"
            >
              未変換（レガシー取込）の材種です。コード構成への変換は今後の
              機能で対応します — 名称・説明・有効のみ編集できます。
            </Alert>
          )}
        </FormSection>
      ) : (
        <FormSection
          description="材種コードはメーカー・メーカー材種・形状から構成され、種類（4桁）は保存時に自動採番されます。"
          title="コード構成"
        >
          <SimpleGrid cols={isMobile ? 1 : 3} mb="sm" spacing="sm">
            <Select
              data={manufacturerOptions}
              label="メーカー"
              placeholder="メーカーを選択"
              withAsterisk
              {...form.getInputProps("manufacturerCode")}
              onChange={(v) => {
                form.setFieldValue("manufacturerCode", v ?? "");
                form.setFieldValue("gradeCode", "");
              }}
            />
            <Select
              data={filteredGrades}
              disabled={!form.values.manufacturerCode}
              label="メーカー材種"
              placeholder={
                form.values.manufacturerCode
                  ? "材種を選択"
                  : "先にメーカーを選択"
              }
              withAsterisk
              {...form.getInputProps("gradeCode")}
            />
            <Select
              data={shapeOptions}
              label="形状"
              placeholder="形状を選択"
              withAsterisk
              {...form.getInputProps("shapeCode")}
            />
          </SimpleGrid>
          <Alert
            color="blue"
            icon={<IconInfoCircle size={16} />}
            variant="light"
          >
            材種コード: <DocNumber>{preview}</DocNumber>
            （#### = 自動採番）
          </Alert>
        </FormSection>
      )}

      <FormSection title="基本情報">
        <LocalizedTextInput
          enProps={form.getInputProps("nameEn")}
          jaProps={form.getInputProps("nameJa")}
          label="名称"
          placeholder="K40UF"
          required
        />
        <Switch
          label="有効"
          mt="md"
          {...form.getInputProps("isActive", { type: "checkbox" })}
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
