"use client";

/**
 * MaterialTypeForm.tsx — 材種 新規作成 / 編集フォーム (MS15 / MS25).
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
import { useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { z } from "zod";
import {
  createMaterialType,
  updateMaterialType,
} from "@/app/(dashboard)/master/material-types/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { DocNumber } from "@/components/ui/DocNumber";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
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
    nameTranslations: z.record(z.string(), z.string()).default({}),
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
  nameTranslations: Record<string, string>;
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
  const tr = useTranslations();
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
      nameTranslations: initial?.nameTranslations ?? {},
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
          title: tr("common.saved2"),
          message: isEdit
            ? tr("master.materialTypes.theMaterialTypeWasUpdated")
            : `材種 ${"code" in result.data ? result.data.code : ""} を作成しました`,
          color: "green",
        });
        router.push(`${BASE_PATH}/${result.data.id}`);
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
        { label: tr("common.materialTypes"), href: BASE_PATH },
        isEdit ? "編集" : tr("common.new2"),
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
          ? `材種 編集 — ${initial.code ?? initial.nameJa}`
          : tr("master.materialTypes.newMaterialType")
      }
    >
      {isEdit ? (
        <FormSection
          description={tr(
            "master.materialTypes.theCodeStructureCannotBeChanged",
          )}
          title={tr("common.codeStructure")}
        >
          {initial.composition ? (
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <TextInput
                disabled
                label={
                  <HelpLabel {...fieldHelp("materialType", "manufacturer")} />
                }
                value={initial.composition.manufacturerLabel}
              />
              <TextInput
                disabled
                label={<HelpLabel {...fieldHelp("materialType", "grade")} />}
                value={initial.composition.gradeLabel}
              />
              <TextInput
                disabled
                label={<HelpLabel {...fieldHelp("materialType", "shape")} />}
                value={initial.composition.shapeLabel}
              />
              <TextInput
                disabled
                label={tr("common.kindNumberedAutomatically")}
                value={initial.composition.kindCode}
              />
            </SimpleGrid>
          ) : (
            <Alert
              color="gray"
              icon={<IconInfoCircle size={16} />}
              variant="light"
            >
              {tr("master.materialTypes.anUnconvertedLegacyImportMaterialType")}
            </Alert>
          )}
        </FormSection>
      ) : (
        <FormSection
          description={tr("master.materialTypes.theMaterialTypeCodeIsBuilt")}
          title={tr("common.codeStructure")}
        >
          <SimpleGrid cols={isMobile ? 1 : 3} mb="sm" spacing="sm">
            <Select
              data={manufacturerOptions}
              label={
                <HelpLabel {...fieldHelp("materialType", "manufacturer")} />
              }
              placeholder={tr("common.selectAManufacturer")}
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
              label={<HelpLabel {...fieldHelp("materialType", "grade")} />}
              placeholder={
                form.values.manufacturerCode
                  ? tr("master.materialTypes.selectAMaterialType")
                  : tr("master.materialTypes.selectAManufacturerFirst")
              }
              withAsterisk
              {...form.getInputProps("gradeCode")}
            />
            <Select
              data={shapeOptions}
              label={<HelpLabel {...fieldHelp("materialType", "shape")} />}
              placeholder={tr("common.selectAShape")}
              withAsterisk
              {...form.getInputProps("shapeCode")}
            />
          </SimpleGrid>
          <Alert
            color="blue"
            icon={<IconInfoCircle size={16} />}
            variant="light"
          >
            {tr("master.materialTypes.materialTypeCode")}{" "}
            <DocNumber>{preview}</DocNumber>
            {tr("master.materialTypes.numberedAutomatically")}
          </Alert>
        </FormSection>
      )}

      <FormSection title={tr("common.basicInformation")}>
        <LocalizedTextInput
          help={fieldHelpTip("materialType", "name")}
          jaProps={form.getInputProps("nameJa")}
          label={tr("common.name2")}
          placeholder="K40UF"
          required
          translationsProps={form.getInputProps("nameTranslations")}
        />
        <Switch
          label={<HelpLabel {...fieldHelp("materialType", "active")} />}
          mt="md"
          {...form.getInputProps("isActive", { type: "checkbox" })}
        />
      </FormSection>

      <FormSection title={tr("common.description")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Textarea
            label={tr("common.descriptionJapanese")}
            placeholder={tr("master.materialTypes.materialTypeDescription")}
            rows={3}
            {...form.getInputProps("descriptionJa")}
          />
          <Textarea
            label={tr("master.materialTypes.descriptionEnglish2")}
            placeholder="Description"
            rows={3}
            {...form.getInputProps("descriptionEn")}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
