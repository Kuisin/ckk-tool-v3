"use client";

/**
 * InspectionTemplateForm.tsx — 検査表テンプレート 新規作成 / 編集フォーム
 * (MS19 / MS29)。
 *
 * code は識別子（作成時のみ入力・編集不可）。関連工程は工程マスタから
 * サーバー検索で選択する。検査項目は詳細画面の「検査項目」タブでインライン
 * 追加・編集する（design.md §13.4 — このフォームでは扱わない）。
 */

import {
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import {
  searchProcessStepOptions,
  searchProductOptions,
  searchUserOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  createInspectionTemplate,
  updateInspectionTemplate,
} from "@/app/(dashboard)/master/inspection-templates/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  inspectionLayoutStyleOptions,
  inspectionSampleNamingOptions,
  inspectionSamplingModeOptions,
} from "@/lib/enum-labels";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";
import type { Tr } from "@/lib/i18n";
import {
  ApprovalTargetField,
  type ApproverOption,
} from "./ApprovalTargetField";

const BASE_PATH = "/master/inspection-templates";

function buildTemplateSchema(tr: Tr) {
  return z
    .object({
      code: z
        .string()
        .min(1, tr("master.inspectionTemplateForm.enterCode"))
        .regex(
          /^[A-Za-z0-9_-]+$/,
          tr("master.inspectionTemplateForm.codeFormat"),
        ),
      nameJa: z
        .string()
        .min(1, tr("master.inspectionTemplateForm.enterNameJa")),
      nameTranslations: z.record(z.string(), z.string()).default({}),
      relatedProcessStepId: z.string().nullable(),
      productId: z.string().nullable(),
      groupId: z.string().nullable(),
      samplingMode: z.enum(["ALL", "PERCENT", "COUNT"]),
      samplingValue: z.union([z.number(), z.literal("")]),
      recordStyle: z.enum(["VALUES", "COUNTS"]),
      layoutStyle: z.enum(["DIMENSIONAL", "CHECKLIST"]),
      sampleNaming: z.enum(["GENERIC", "INITIAL_MID_FINAL"]),
      approvalGroupId: z.string().nullable(),
      approvers: z.array(z.object({ value: z.string(), label: z.string() })),
      isActive: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const issue = (message: string) =>
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["samplingValue"],
          message,
        });
      if (v.samplingMode === "PERCENT") {
        if (
          v.samplingValue === "" ||
          v.samplingValue <= 0 ||
          v.samplingValue > 100
        ) {
          issue(tr("master.inspectionTemplates.enterThePercentageToInspect0"));
        }
      }
      if (v.samplingMode === "COUNT") {
        if (
          v.samplingValue === "" ||
          v.samplingValue < 1 ||
          !Number.isInteger(v.samplingValue)
        ) {
          issue(tr("master.inspectionTemplates.enterHowManyPiecesToInspect"));
        }
      }
    });
}

type FormValues = z.infer<ReturnType<typeof buildTemplateSchema>>;

export interface InspectionTemplateFormInitial {
  id: number;
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  relatedProcessStepId: string | null;
  relatedProcessStepLabel: string;
  /** 対象製品。null = どの製品にも使える（汎用）。 */
  productId: string | null;
  productLabel: string;
  /** ナビゲーション用グループ（任意）。 */
  groupId: string | null;
  samplingMode: "ALL" | "PERCENT" | "COUNT";
  samplingValue: number | null;
  recordStyle: "VALUES" | "COUNTS";
  layoutStyle: "DIMENSIONAL" | "CHECKLIST";
  sampleNaming: "GENERIC" | "INITIAL_MID_FINAL";
  /** 検査承認グループ（承認設定 MS0B）。null = 未設定 = 誰でも承認できる。 */
  approvalGroupId: string | null;
  /** カスタム承認者（この検査表だけの指名）。approvalGroupId とは排他。 */
  approvers: ApproverOption[];
  isActive: boolean;
}

export function InspectionTemplateForm({
  initial,
  groupOptions,
  templateGroupOptions,
}: {
  initial?: InspectionTemplateFormInitial;
  /** 検査承認グループの選択肢（承認設定 MS0B の approval_groups）。 */
  groupOptions: { value: string; label: string }[];
  /** 検査表のナビゲーション用グループの選択肢（有効のみ）。 */
  templateGroupOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(buildTemplateSchema(tr)),
    initialValues: {
      code: initial?.code ?? "",
      nameJa: initial?.nameJa ?? "",
      nameTranslations: initial?.nameTranslations ?? {},
      relatedProcessStepId: initial?.relatedProcessStepId ?? null,
      productId: initial?.productId ?? null,
      groupId: initial?.groupId ?? null,
      samplingMode: initial?.samplingMode ?? "ALL",
      samplingValue: initial?.samplingValue ?? "",
      recordStyle: initial?.recordStyle ?? "VALUES",
      layoutStyle: initial?.layoutStyle ?? "DIMENSIONAL",
      sampleNaming: initial?.sampleNaming ?? "GENERIC",
      approvalGroupId: initial?.approvalGroupId ?? null,
      approvers: initial?.approvers ?? [],
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
        nameTranslations: values.nameTranslations,
        relatedProcessStepId,
        productId: values.productId ? Number(values.productId) : null,
        groupId: values.groupId ? Number(values.groupId) : null,
        samplingMode: values.samplingMode,
        samplingValue:
          values.samplingMode === "ALL" || values.samplingValue === ""
            ? null
            : values.samplingValue,
        recordStyle: values.recordStyle,
        layoutStyle: values.layoutStyle,
        sampleNaming: values.sampleNaming,
        approvalGroupId: values.approvalGroupId
          ? Number(values.approvalGroupId)
          : null,
        approverUserIds: values.approvers.map((a) => a.value),
        isActive: values.isActive,
      };
      const result = isEdit
        ? await updateInspectionTemplate(initial.id, input)
        : await createInspectionTemplate({ ...input, code: values.code });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? tr("master.inspectionTemplates.theInspectionTemplateWasUpdated")
            : tr("master.inspectionTemplates.theInspectionTemplateWasCreated"),
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
        { label: tr("common.inspectionTemplates"), href: BASE_PATH },
        isEdit ? tr("common.edit") : tr("common.new2"),
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
          ? tr("master.inspectionTemplateForm.editTitle", {
              code: initial.code,
            })
          : tr("master.inspectionTemplates.newInspectionTemplate")
      }
    >
      <FormSection title={tr("common.basicInformation")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            description={
              isEdit
                ? tr("master.inspectionTemplates.theCodeCannotBeChangedOnce")
                : tr("master.inspectionTemplates.lettersDigitsAndUnique")
            }
            disabled={isEdit}
            label={
              <HelpLabel
                {...fieldHelp("inspectionTemplate", "code", {
                  label: tr("master.inspectionTemplateForm.code"),
                })}
              />
            }
            placeholder={tr("master.inspectionTemplates.eGInspDim01")}
            withAsterisk={!isEdit}
            {...form.getInputProps("code")}
          />
          <SearchSelect
            description={tr(
              "master.inspectionTemplates.theInspectionStepThatUsesThis",
            )}
            initialOption={
              initial?.relatedProcessStepId
                ? {
                    value: initial.relatedProcessStepId,
                    label: initial.relatedProcessStepLabel,
                  }
                : undefined
            }
            label={
              <HelpLabel {...fieldHelp("inspectionTemplate", "processStep")} />
            }
            onChange={(value) =>
              form.setFieldValue("relatedProcessStepId", value)
            }
            onSearch={searchProcessStepOptions}
            placeholder={tr(
              "master.inspectionTemplates.searchByStepCodeOrName",
            )}
            storageKey="inspection-template-process-step"
            value={form.values.relatedProcessStepId}
          />
          <SearchSelect
            description={tr(
              "master.inspectionTemplates.theProductItIsNarrowedTo",
            )}
            initialOption={
              initial?.productId
                ? { value: initial.productId, label: initial.productLabel }
                : undefined
            }
            label={tr("common.targetProduct")}
            onChange={(value) => form.setFieldValue("productId", value)}
            onSearch={searchProductOptions}
            placeholder={tr("common.searchByProductCodeOrName")}
            storageKey="inspection-template-product"
            value={form.values.productId}
          />
          <Select
            clearable
            data={templateGroupOptions}
            description={tr(
              "master.inspectionTemplates.aDisplayAxisUsedOnlyFor",
            )}
            label={tr("common.group")}
            onChange={(v) => form.setFieldValue("groupId", v)}
            placeholder={tr("common.selectAGroup")}
            searchable
            value={form.values.groupId}
          />
        </SimpleGrid>
        <SimpleGrid cols={1} mt="sm" spacing="sm">
          <LocalizedTextInput
            help={fieldHelpTip("inspectionTemplate", "code")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("common.name2")}
            required
            translationsProps={form.getInputProps("nameTranslations")}
          />
          <Stack gap={4}>
            <Text fw={500} size="sm">
              {tr(
                "master.inspectionTemplates.inspectionTargetHowManyProductsThis",
              )}
            </Text>
            <Group gap="sm" wrap="wrap">
              <SegmentedControl
                data={inspectionSamplingModeOptions(locale)}
                onChange={(v) => {
                  form.setFieldValue(
                    "samplingMode",
                    v as "ALL" | "PERCENT" | "COUNT",
                  );
                  if (v === "ALL") form.setFieldValue("samplingValue", "");
                }}
                value={form.values.samplingMode}
              />
              {form.values.samplingMode !== "ALL" && (
                <NumberInput
                  aria-label={
                    form.values.samplingMode === "PERCENT"
                      ? tr("master.inspectionTemplates.percentageToInspect")
                      : tr("master.inspectionTemplates.piecesToInspect")
                  }
                  max={form.values.samplingMode === "PERCENT" ? 100 : undefined}
                  min={form.values.samplingMode === "PERCENT" ? 0.01 : 1}
                  suffix={
                    form.values.samplingMode === "PERCENT"
                      ? " %"
                      : ` ${tr("common.pcs")}`
                  }
                  w={140}
                  {...form.getInputProps("samplingValue")}
                />
              )}
            </Group>
            <Text c="dimmed" size="xs">
              {tr("master.inspectionTemplates.allTheWholeLotPercentOr")}
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text fw={500} size="sm">
              {tr("common.recordingMode")}
            </Text>
            <SegmentedControl
              data={[
                {
                  value: "VALUES",
                  label: tr("common.measuredValuePerProduct"),
                },
                { value: "COUNTS", label: tr("common.passCountOnly") },
              ]}
              onChange={(v) =>
                form.setFieldValue("recordStyle", v as "VALUES" | "COUNTS")
              }
              value={form.values.recordStyle}
            />
            <Text c="dimmed" size="xs">
              {tr(
                "master.inspectionTemplates.measuredValuesRecordEveryItemPer",
              )}
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text fw={500} size="sm">
              {tr("common.printLayout")}
            </Text>
            <SegmentedControl
              data={inspectionLayoutStyleOptions(locale)}
              onChange={(v) =>
                form.setFieldValue(
                  "layoutStyle",
                  v as "DIMENSIONAL" | "CHECKLIST",
                )
              }
              value={form.values.layoutStyle}
            />
            <Text c="dimmed" size="xs">
              {tr("master.inspectionTemplates.dimensionSheetAGridOfBase")}
            </Text>
          </Stack>
          {form.values.recordStyle === "VALUES" && (
            <Stack gap={4}>
              <Text fw={500} size="sm">
                {tr("common.sampleName")}
              </Text>
              <SegmentedControl
                data={inspectionSampleNamingOptions(locale)}
                onChange={(v) =>
                  form.setFieldValue(
                    "sampleNaming",
                    v as "GENERIC" | "INITIAL_MID_FINAL",
                  )
                }
                value={form.values.sampleNaming}
              />
              <Text c="dimmed" size="xs">
                {tr(
                  "master.inspectionTemplates.firstArticleIntermediateAndFinalOnly",
                )}
              </Text>
            </Stack>
          )}
          <ApprovalTargetField
            approvers={form.values.approvers}
            groupId={form.values.approvalGroupId}
            groupOptions={groupOptions}
            onApproversChange={(v) => form.setFieldValue("approvers", v)}
            onGroupChange={(v) => form.setFieldValue("approvalGroupId", v)}
            onSearchApprovers={searchUserOptions}
          />
          <Switch
            label={<HelpLabel {...fieldHelp("inspectionTemplate", "active")} />}
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
