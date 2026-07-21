"use client";

/**
 * ProcessStepForm.tsx — 工程マスタ 新規作成 / 編集フォーム (MS17 / MS27).
 *
 * 基本情報に加えて、使用依存・実行依存の行エディタ（依存先 SearchSelect ×
 * 結合 AND/OR ×（使用依存のみ）排他 × 備考）を持つ。保存時は依存行を
 * サーバー側で全置換する（actions.ts）。工程コードは作成後不変。
 */

import {
  Box,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { z } from "zod";
import { searchProcessStepOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  createProcessStep,
  updateProcessStep,
} from "@/app/(dashboard)/master/process-steps/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { GhostButton } from "@/components/ui/buttons";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  FormSection,
  FormShell,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  DEPENDENCY_RELATION_OPTIONS,
  PROCESS_CATEGORY_OPTIONS,
  PROCESS_EXECUTION_OPTIONS,
} from "@/lib/enum-labels";
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
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    if (!row.dependsOnStepId) return;
    const firstIndex = seen.get(row.dependsOnStepId);
    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, index, "dependsOnStepId"],
        message: "依存先の工程が重複しています",
      });
    } else {
      seen.set(row.dependsOnStepId, index);
    }
  });
}

const processStepSchema = z
  .object({
    code: z.string(),
    nameJa: z.string().min(1, "名称（日本語）を入力してください"),
    nameEn: z.string(),
    category: z.string().min(1, "カテゴリを選択してください"),
    executionLocation: z.string().min(1, "実施場所を選択してください"),
    isSyncCapable: z.boolean(),
    isInspection: z.boolean(),
    isApprovalStep: z.boolean(),
    approvalMinRank: z.string(),
    sortOrder: z.number().int("表示順は整数で入力してください"),
    isActive: z.boolean(),
    notes: z.string(),
    useDeps: z.array(depRowSchema),
    execDeps: z.array(depRowSchema),
  })
  .superRefine((v, ctx) => {
    refineDepRows(v.useDeps, "useDeps", ctx);
    refineDepRows(v.execDeps, "execDeps", ctx);
  });

type FormValues = z.infer<typeof processStepSchema>;

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
  nameEn: string;
  category: string;
  executionLocation: string;
  isSyncCapable: boolean;
  isInspection: boolean;
  isApprovalStep: boolean;
  approvalMinRank: string;
  sortOrder: number;
  isActive: boolean;
  notes: string;
  useDeps: ProcessStepFormDep[];
  execDeps: ProcessStepFormDep[];
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
}: {
  initial?: ProcessStepFormInitial;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initial;

  const form = useForm<FormValues>({
    validate: zodResolver(processStepSchema),
    initialValues: {
      code: initial?.code ?? "",
      nameJa: initial?.nameJa ?? "",
      nameEn: initial?.nameEn ?? "",
      category: initial?.category ?? "",
      executionLocation: initial?.executionLocation ?? "",
      isSyncCapable: initial?.isSyncCapable ?? false,
      isInspection: initial?.isInspection ?? false,
      isApprovalStep: initial?.isApprovalStep ?? false,
      approvalMinRank: initial?.approvalMinRank ?? "",
      sortOrder: initial?.sortOrder ?? 0,
      isActive: initial?.isActive ?? true,
      notes: initial?.notes ?? "",
      useDeps: toDepRows(initial?.useDeps ?? [], "use"),
      execDeps: toDepRows(initial?.execDeps ?? [], "exec"),
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
            "自分自身の工程は指定できません",
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
      nameEn: values.nameEn,
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
      approvalMinRank: values.approvalMinRank,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
      notes: values.notes,
      useDependencies,
      execDependencies,
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateProcessStep(initial.id, payload)
        : await createProcessStep({ ...payload, code: values.code });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit ? "工程を更新しました" : "工程を作成しました",
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
                  placeholder="依存先の工程を検索"
                  storageKey="process-step-dep"
                  value={row.dependsOnStepId}
                />
              </Box>
              <Select
                allowDeselect={false}
                data={DEPENDENCY_RELATION_OPTIONS}
                w={isMobile ? 150 : 160}
                {...form.getInputProps(`${field}.${index}.relation`)}
              />
              {withNegation && (
                <Switch
                  label="排他"
                  mt={8}
                  {...form.getInputProps(`${field}.${index}.isNegation`, {
                    type: "checkbox",
                  })}
                />
              )}
              <TextInput
                placeholder="備考"
                style={{ flex: 1, minWidth: isMobile ? "60%" : 140 }}
                {...form.getInputProps(`${field}.${index}.notes`)}
              />
              <GhostButton
                aria-label="この依存を削除"
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
          依存を追加
        </GhostButton>
      </>
    );
  };

  return (
    <FormShell
      breadcrumbs={[
        "マスタ",
        { label: "工程マスタ", href: BASE_PATH },
        isEdit ? "編集" : "新規作成",
      ]}
      isDirty={form.isDirty()}
      isPending={isPending}
      onCancel={() =>
        router.push(isEdit ? `${BASE_PATH}/${initial.id}` : BASE_PATH)
      }
      onSubmit={form.onSubmit(handleSubmit)}
      status={isEdit ? <ActiveBadge active={initial.isActive} /> : undefined}
      title={isEdit ? `工程 編集 — ${initial.code}` : "工程 新規作成"}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          {isEdit ? (
            <TextInput
              description="工程コードは作成後変更できません"
              disabled
              label="工程コード"
              value={initial.code}
            />
          ) : (
            <TextInput
              description="英大文字・数字・アンダースコア（例: CYLINDER_MACHINING）"
              label="工程コード"
              placeholder="CYLINDER_MACHINING"
              withAsterisk
              {...form.getInputProps("code")}
            />
          )}
          <NumberInput
            description="一覧・カタログの既定の並び順（実行順は依存解決で決定）"
            label="表示順"
            {...form.getInputProps("sortOrder")}
          />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            enProps={form.getInputProps("nameEn")}
            jaProps={form.getInputProps("nameJa")}
            label="名称"
            required
          />
        </Stack>
        <SimpleGrid cols={isMobile ? 1 : 2} mt="sm" spacing="sm">
          <Select
            data={PROCESS_CATEGORY_OPTIONS}
            label="カテゴリ"
            withAsterisk
            {...form.getInputProps("category")}
          />
          <Select
            data={PROCESS_EXECUTION_OPTIONS}
            label="実施場所"
            withAsterisk
            {...form.getInputProps("executionLocation")}
          />
        </SimpleGrid>
        <Stack gap="xs" mt="sm">
          <Switch
            description="他工程と同時実施・記録できる工程"
            label="同期可"
            {...form.getInputProps("isSyncCapable", { type: "checkbox" })}
          />
          <Switch
            label="検査工程"
            {...form.getInputProps("isInspection", { type: "checkbox" })}
          />
          <Switch
            label="検査承認工程"
            {...form.getInputProps("isApprovalStep", { type: "checkbox" })}
          />
          {form.values.isApprovalStep && (
            <TextInput
              description="この承認工程を実行できる最低役職"
              label="承認必要役職"
              placeholder="例: 係長以上"
              {...form.getInputProps("approvalMinRank")}
            />
          )}
          <Switch
            label="有効"
            {...form.getInputProps("isActive", { type: "checkbox" })}
          />
        </Stack>
        <Textarea
          label="備考"
          mt="sm"
          placeholder="備考・特記事項"
          rows={3}
          {...form.getInputProps("notes")}
        />
      </FormSection>

      <FormSection
        description="この工程をワークフローに含めてよい条件（依存先工程の存在）。排他 = 依存先が存在しないこと（!）。保存時に依存行は全置換されます。"
        title="使用依存"
      >
        {depRowsEditor("useDeps")}
      </FormSection>

      <FormSection
        description="この工程を開始してよい条件（依存先工程の完了）。ワークフローに存在しない依存先は満たされた扱いになります。"
        title="実行依存"
      >
        {depRowsEditor("execDeps")}
      </FormSection>
    </FormShell>
  );
}
