"use client";

/**
 * ProcessStepForm.tsx — 工程マスタ 新規作成 / 編集フォーム (MS18 / MS28).
 *
 * 基本情報に加えて、使用依存・実行依存の行エディタ（依存先 SearchSelect ×
 * 結合 AND/OR ×（使用依存のみ）排他 × 備考）を持つ。保存時は依存行を
 * サーバー側で全置換する（actions.ts）。工程コードは作成後不変。
 */

import {
  Box,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { z } from "zod";
import { searchProcessStepOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createProcessStep,
  updateProcessStep,
} from "@/app/(dashboard)/master/process-steps/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { GhostButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  dependencyRelationOptions,
  lotInputModeOptions,
  processCategoryOptions,
  processExecutionOptions,
  quantityTrackingOptions,
} from "@/lib/enum-labels";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import { zodResolver } from "@/lib/form";

const BASE_PATH = "/master/process-steps";

// 依存行（フォーム内表現）。key は React 用のクライアント生成キー。
// isNegation は使用依存のみ使用（実行依存では送信時に落とす）。
const depRowSchema = z.object({
  key: z.string(),
  dependsOnStepId: z.string().nullable(),
  dependsOnLabel: z.string(),
  relation: z.enum(["AND", "OR"]),
  isNegation: z.boolean(),
  notes: z.string(),
});

type DepRow = z.infer<typeof depRowSchema>;

/** 依存先が選ばれている行だけを対象に、重複をエラーにする。 */
function refineDepRows(
  rows: DepRow[],
  field: "useDeps" | "execDeps",
  ctx: z.RefinementCtx,
) {
  const tr = useTranslations();
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    if (!row.dependsOnStepId) return;
    const firstIndex = seen.get(row.dependsOnStepId);
    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, index, "dependsOnStepId"],
        message: tr("master.processSteps.theDependencyStepAppearsTwice"),
      });
    } else {
      seen.set(row.dependsOnStepId, index);
    }
  });
}

const processStepSchema = (tr: (key: string) => string) =>
  z
    .object({
      code: z.string(),
      nameJa: z.string().min(1, tr("common.nameJaRequired")),
      nameTranslations: z.record(z.string(), z.string()).default({}),
      category: z.string().min(1, tr("master.processSteps.categoryRequired")),
      executionLocation: z
        .string()
        .min(1, tr("master.processSteps.executionLocationRequired")),
      isSyncCapable: z.boolean(),
      isInspection: z.boolean(),
      isApprovalStep: z.boolean(),
      isFinalInspection: z.boolean(),
      approvalMinRank: z.string(),
      quantityTracking: z.enum(["NONE", "FLOW", "INSPECTION"]),
      lotInputMode: z.enum(["REQUIRED", "OPTIONAL", "NONE"]),
      // NumberInput の未入力は "" — 送信時に null へ変換する
      defaultWorkHours: z.union([
        z.number().positive(tr("master.processSteps.defaultWorkHoursPositive")),
        z.literal(""),
      ]),
      sortOrder: z.number().int(tr("master.processSteps.sortOrderInteger")),
      isActive: z.boolean(),
      notes: z.string(),
      useDeps: z.array(depRowSchema),
      execDeps: z.array(depRowSchema),
      allowedTypeKeys: z.array(z.string()),
      allowedLocationIds: z.array(z.string()),
    })
    .superRefine((v, ctx) => {
      refineDepRows(v.useDeps, "useDeps", ctx);
      refineDepRows(v.execDeps, "execDeps", ctx);
    });

type FormValues = z.infer<ReturnType<typeof processStepSchema>>;

export interface ProcessStepFormDep {
  dependsOnStepId: number;
  dependsOnLabel: string;
  relation: string;
  isNegation: boolean;
  notes: string;
}

export interface ProcessStepFormInitial {
  id: number;
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  category: string;
  executionLocation: string;
  isSyncCapable: boolean;
  isInspection: boolean;
  isApprovalStep: boolean;
  isFinalInspection: boolean;
  approvalMinRank: string;
  quantityTracking: string;
  lotInputMode: string;
  defaultWorkHours: number | null;
  sortOrder: number;
  isActive: boolean;
  notes: string;
  useDeps: ProcessStepFormDep[];
  execDeps: ProcessStepFormDep[];
  /** 許可作業場所（種別キー / 場所 id 文字列）。両方空 = 無制限。 */
  allowedTypeKeys: string[];
  allowedLocationIds: string[];
}

let depKeySeq = 0;
function newDepRow(): DepRow {
  depKeySeq += 1;
  return {
    key: `new-${depKeySeq}`,
    dependsOnStepId: null,
    dependsOnLabel: "",
    relation: "AND",
    isNegation: false,
    notes: "",
  };
}

function toDepRows(deps: ProcessStepFormDep[], prefix: string): DepRow[] {
  return deps.map((d, i) => ({
    key: `${prefix}-${i}`,
    dependsOnStepId: String(d.dependsOnStepId),
    dependsOnLabel: d.dependsOnLabel,
    relation: d.relation === "OR" ? "OR" : "AND",
    isNegation: d.isNegation,
    notes: d.notes,
  }));
}

export function ProcessStepForm({
  initial,
  workLocationTypeOptions,
  workLocationOptions,
}: {
  initial?: ProcessStepFormInitial;
  /** 作業場所種別の選択肢（machine / area + 管理者定義）。 */
  workLocationTypeOptions: { value: string; label: string }[];
  /** 作業場所の選択肢（有効のみ、「グループ / 場所」ラベル）。 */
  workLocationOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(processStepSchema(tr)),
    initialValues: {
      code: initial?.code ?? "",
      nameJa: initial?.nameJa ?? "",
      nameTranslations: initial?.nameTranslations ?? {},
      category: initial?.category ?? "",
      executionLocation: initial?.executionLocation ?? "",
      isSyncCapable: initial?.isSyncCapable ?? false,
      isInspection: initial?.isInspection ?? false,
      isApprovalStep: initial?.isApprovalStep ?? false,
      isFinalInspection: initial?.isFinalInspection ?? false,
      approvalMinRank: initial?.approvalMinRank ?? "",
      quantityTracking:
        initial?.quantityTracking === "NONE" ||
        initial?.quantityTracking === "INSPECTION"
          ? initial.quantityTracking
          : "FLOW",
      lotInputMode:
        initial?.lotInputMode === "REQUIRED" ||
        initial?.lotInputMode === "OPTIONAL"
          ? initial.lotInputMode
          : "NONE",
      defaultWorkHours: initial?.defaultWorkHours ?? "",
      sortOrder: initial?.sortOrder ?? 0,
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
      useDeps: toDepRows(initial?.useDeps ?? [], "use"),
      execDeps: toDepRows(initial?.execDeps ?? [], "exec"),
      allowedTypeKeys: initial?.allowedTypeKeys ?? [],
      allowedLocationIds: initial?.allowedLocationIds ?? [],
    },
  });

  const handleSubmit = (values: FormValues) => {
    // 自己依存はサーバーでも拒否するが、編集時はここでも早期に弾く。
    if (isEdit) {
      const selfId = String(initial.id);
      for (const field of ["useDeps", "execDeps"] as const) {
        const index = values[field].findIndex(
          (r) => r.dependsOnStepId === selfId,
        );
        if (index >= 0) {
          form.setFieldError(
            `${field}.${index}.dependsOnStepId`,
            tr("master.processSteps.aStepCannotDependOnItself"),
          );
          return;
        }
      }
    }
    // 依存先未選択の行は無視して送信する（空行は保存しない）。
    const useDependencies = values.useDeps
      .filter((r) => r.dependsOnStepId)
      .map((r) => ({
        dependsOnStepId: Number(r.dependsOnStepId),
        relation: r.relation,
        isNegation: r.isNegation,
        notes: r.notes,
      }));
    const execDependencies = values.execDeps
      .filter((r) => r.dependsOnStepId)
      .map((r) => ({
        dependsOnStepId: Number(r.dependsOnStepId),
        relation: r.relation,
        notes: r.notes,
      }));
    const payload = {
      nameJa: values.nameJa,
      nameTranslations: values.nameTranslations,
      category: values.category as
        | "MATERIAL_PREP"
        | "MACHINING"
        | "COATING"
        | "INSPECTION"
        | "APPROVAL"
        | "SHIPPING",
      executionLocation: values.executionLocation as
        | "INTERNAL"
        | "INTERNAL_OR_OUTSOURCE",
      isSyncCapable: values.isSyncCapable,
      isInspection: values.isInspection,
      isApprovalStep: values.isApprovalStep,
      isFinalInspection: values.isFinalInspection,
      approvalMinRank: values.approvalMinRank,
      quantityTracking: values.quantityTracking,
      lotInputMode: values.lotInputMode,
      defaultWorkHours:
        values.defaultWorkHours === "" ? null : values.defaultWorkHours,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
      notes: values.notes,
      useDependencies,
      execDependencies,
      allowedLocationTypeKeys: values.allowedTypeKeys,
      allowedLocationIds: values.allowedLocationIds.map((v) => Number(v)),
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateProcessStep(initial.id, payload)
        : await createProcessStep({ ...payload, code: values.code });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? tr("master.processSteps.stepUpdated")
            : tr("master.processSteps.theStepWasCreated"),
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

  /** 依存行エディタ（使用依存 = 排他スイッチあり / 実行依存 = なし）。 */
  const depRowsEditor = (field: "useDeps" | "execDeps") => {
    const rows = form.values[field];
    const withNegation = field === "useDeps";
    return (
      <>
        {rows.map((row, index) => (
          <Stack gap={4} key={row.key} mb="xs">
            <Group
              align="flex-start"
              gap="xs"
              wrap={isMobile ? "wrap" : "nowrap"}
            >
              <Box style={{ flex: 2, minWidth: isMobile ? "100%" : 220 }}>
                <SearchSelect
                  error={form.errors[`${field}.${index}.dependsOnStepId`]}
                  initialOption={
                    row.dependsOnStepId
                      ? {
                          value: row.dependsOnStepId,
                          label: row.dependsOnLabel,
                        }
                      : null
                  }
                  onChange={(value, option) => {
                    form.setFieldValue(
                      `${field}.${index}.dependsOnStepId`,
                      value,
                    );
                    form.setFieldValue(
                      `${field}.${index}.dependsOnLabel`,
                      option?.label ?? "",
                    );
                  }}
                  onSearch={searchProcessStepOptions}
                  placeholder={tr(
                    "master.processSteps.searchForTheStepItDepends",
                  )}
                  storageKey="process-step-dep"
                  value={row.dependsOnStepId}
                />
              </Box>
              <Select
                allowDeselect={false}
                data={dependencyRelationOptions(locale)}
                w={isMobile ? 150 : 160}
                {...form.getInputProps(`${field}.${index}.relation`)}
              />
              {withNegation && (
                <Switch
                  label={tr("common.exclusive")}
                  mt={8}
                  {...form.getInputProps(`${field}.${index}.isNegation`, {
                    type: "checkbox",
                  })}
                />
              )}
              <TextInput
                placeholder={tr("common.notes")}
                style={{ flex: 1, minWidth: isMobile ? "60%" : 140 }}
                {...form.getInputProps(`${field}.${index}.notes`)}
              />
              <GhostButton
                aria-label={tr("master.processSteps.removeThisDependency")}
                color="red"
                onClick={() => form.removeListItem(field, index)}
                px={6}
              >
                <IconMinus size={14} />
              </GhostButton>
            </Group>
          </Stack>
        ))}
        <GhostButton
          fullWidth={isMobile}
          leftSection={<IconPlus size={14} />}
          mt={rows.length > 0 ? "xs" : 0}
          onClick={() => form.insertListItem(field, newDepRow())}
        >
          {tr("master.processSteps.addADependency")}
        </GhostButton>
      </>
    );
  };

  return (
    <FormShell
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("common.processSteps"), href: BASE_PATH },
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
          ? tr("master.processSteps.editTitle", { code: initial.code })
          : tr("master.processSteps.newStep")
      }
    >
      <FormSection title={tr("common.basicInformation")}>
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          {isEdit ? (
            <TextInput
              description={tr("master.processSteps.theStepCodeCannotBeChanged")}
              disabled
              label={
                <HelpLabel
                  {...fieldHelp(tr, "processStep", "code", {
                    label: tr("common.stepCode"),
                  })}
                />
              }
              value={initial.code}
            />
          ) : (
            <TextInput
              description={tr(
                "master.processSteps.uppercaseLettersDigitsAndUnderscoresE",
              )}
              label={
                <HelpLabel
                  {...fieldHelp(tr, "processStep", "code", {
                    label: tr("common.stepCode"),
                  })}
                />
              }
              placeholder="CYLINDER_MACHINING"
              withAsterisk
              {...form.getInputProps("code")}
            />
          )}
          <NumberInput
            description={tr("master.processSteps.defaultOrderInListsAndThe")}
            label={<HelpLabel {...fieldHelp(tr, "processStep", "sortOrder")} />}
            {...form.getInputProps("sortOrder")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            help={fieldHelpTip(tr, "processStep", "code")}
            jaProps={form.getInputProps("nameJa")}
            label={tr("common.name2")}
            required
            translationsProps={form.getInputProps("nameTranslations")}
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <Select
            data={processCategoryOptions(locale)}
            label={<HelpLabel {...fieldHelp(tr, "processStep", "category")} />}
            withAsterisk
            {...form.getInputProps("category")}
          />
          <Select
            data={processExecutionOptions(locale)}
            label={<HelpLabel {...fieldHelp(tr, "processStep", "execution")} />}
            withAsterisk
            {...form.getInputProps("executionLocation")}
          />
          <Select
            allowDeselect={false}
            data={quantityTrackingOptions(locale)}
            description={tr(
              "master.processSteps.quantityEntryWhenRunningTheStep",
            )}
            label={
              <HelpLabel
                {...fieldHelp(tr, "processStep", "quantityTracking")}
              />
            }
            {...form.getInputProps("quantityTracking")}
          />
          <Select
            allowDeselect={false}
            data={lotInputModeOptions(locale)}
            description={tr("master.processSteps.lotSlipCodeEntryAtStep")}
            label={tr("common.lotEntryDefault")}
            {...form.getInputProps("lotInputMode")}
          />
          <NumberInput
            decimalScale={2}
            description={tr("master.processSteps.theInitialValueForStepsOn")}
            label={
              <HelpLabel {...fieldHelp(tr, "processStep", "defaultTime")} />
            }
            min={0.01}
            suffix=" h"
            {...form.getInputProps("defaultWorkHours")}
          />
        </SimpleGrid>
        <Stack gap="xs" mt="sm">
          <Switch
            description={tr("master.processSteps.aStepThatCanRunAnd")}
            label={<HelpLabel {...fieldHelp(tr, "processStep", "sync")} />}
            {...form.getInputProps("isSyncCapable", { type: "checkbox" })}
          />
          <Switch
            label={
              <HelpLabel
                {...fieldHelp(tr, "processStep", "inspection", {
                  label: tr("common.inspectionStep"),
                })}
              />
            }
            {...form.getInputProps("isInspection", { type: "checkbox" })}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              form.setFieldValue("isInspection", checked);
              // 検査工程トグルに合わせて数量管理モードを提案（手動変更可）。
              if (checked && form.values.quantityTracking === "FLOW") {
                form.setFieldValue("quantityTracking", "INSPECTION");
              } else if (
                !checked &&
                form.values.quantityTracking === "INSPECTION"
              ) {
                form.setFieldValue("quantityTracking", "FLOW");
              }
            }}
          />
          <Switch
            label={
              <HelpLabel
                {...fieldHelp(tr, "processStep", "inspection", {
                  label: tr("master.processSteps.inspectionApprovalStep"),
                })}
              />
            }
            {...form.getInputProps("isApprovalStep", { type: "checkbox" })}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              form.setFieldValue("isApprovalStep", checked);
              // 検査承認は「前工程の検査表を見て印を押す」ゲートで、物を
              // 加工する工程ではない。数量を持たせると、承認するだけの工程を
              // 完了するのに前工程と同じ数を打ち直すことになる。
              if (checked) form.setFieldValue("quantityTracking", "NONE");
            }}
          />
          {form.values.isApprovalStep && (
            <Text c="dimmed" size="xs">
              {tr("master.processSteps.approvalStepsHaveNoQuantity")}
            </Text>
          )}
          {form.values.isApprovalStep && (
            <TextInput
              description={tr("master.processSteps.theLowestRankThatCanRun")}
              label={
                <HelpLabel {...fieldHelp(tr, "processStep", "approvalRank")} />
              }
              placeholder={tr("master.processSteps.eGSectionChiefAndAbove")}
              {...form.getInputProps("approvalMinRank")}
            />
          )}
          {/* 最終検査は指示書 1 件に 1 行なので、印を付けた工程の実行画面が
              唯一の記入口になる（印の付いた工程を入れない指示書 = 最終検査なし）。 */}
          <Switch
            description={tr(
              "master.processSteps.theFinalInspectionChecklistIsRecorded",
            )}
            label={tr("master.processSteps.finalInspectionStep")}
            {...form.getInputProps("isFinalInspection", { type: "checkbox" })}
          />
          <Switch
            label={
              <HelpLabel
                {...fieldHelp(tr, "processStep", "active", {
                  label: tr("common.enabled"),
                })}
              />
            }
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </Stack>
        <Textarea
          label={
            <HelpLabel
              {...fieldHelp(tr, "processStep", "active", {
                label: tr("common.notes"),
              })}
            />
          }
          mt="sm"
          placeholder={tr("common.notesAndRemarks")}
          rows={3}
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection
        description={tr("master.processSteps.whenThisStepMayBeIncluded")}
        title={tr("master.processSteps.useDependency")}
      >
        {depRowsEditor("useDeps")}
      </FormSection>

      <FormSection
        description={tr("master.processSteps.whenThisStepMayStartIts")}
        title={tr("master.processSteps.executionDependency")}
      >
        {depRowsEditor("execDeps")}
      </FormSection>

      <FormSection
        description={tr(
          "master.processSteps.restrictsWhichWorkLocationsThisStep",
        )}
        title={tr("common.allowedWorkLocations")}
      >
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <MultiSelect
            clearable
            data={workLocationTypeOptions}
            description={tr("master.processSteps.allowEveryLocationOfThatType")}
            label={
              <HelpLabel
                {...fieldHelp(tr, "processStep", "allowedLocations", {
                  label: tr("master.processSteps.allowByType"),
                })}
              />
            }
            placeholder={
              form.values.allowedTypeKeys.length > 0
                ? undefined
                : tr("common.selectAType")
            }
            searchable
            {...form.getInputProps("allowedTypeKeys")}
          />
          <MultiSelect
            clearable
            data={workLocationOptions}
            description={tr("master.processSteps.allowSpecificMachinesOrAreas")}
            label={tr("master.processSteps.allowByLocation")}
            placeholder={
              form.values.allowedLocationIds.length > 0
                ? undefined
                : tr("master.processSteps.searchWorkLocations")
            }
            searchable
            {...form.getInputProps("allowedLocationIds")}
          />
        </SimpleGrid>
      </FormSection>
    </FormShell>
  );
}
