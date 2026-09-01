"use client";

/**
 * ApprovalFlowRulesSection — 条件付き承認フロー（MS0B）の管理。
 *
 * 書類種別 1 つの承認フロー編集ページ（ApprovalFlowEditor）の下に置く。
 * ルール = 条件（AND）+ 専用の段構成。上から順（priority 昇順）に評価し、
 * 承認依頼を出す時点で**最初に一致した 1 本**の段構成を既定フローの代わりに
 * 使う。どれにも一致しなければ上の既定フロー。進行中の書類は依頼時点の
 * スナップショットのまま進む（既定フローの編集と同じ）。
 *
 * 一覧の操作（並べ替え・有効/無効・削除）は即保存、ルールの中身
 * （名称・条件・段）はモーダルでまとめて保存する。条件の語彙・検証・要約は
 * lib/approval-conditions.ts（サーバーの評価と同じ定義）。
 */

import {
  ActionIcon,
  Badge,
  Box,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  type ApprovalFlowRuleInput,
  deleteApprovalFlowRule,
  moveApprovalFlowRule,
  saveApprovalFlowRule,
  toggleApprovalFlowRule,
} from "@/app/(dashboard)/master/approval-settings/actions";
import { GhostButton } from "@/components/ui/buttons";
import { ModalShell, openConfirm } from "@/components/ui/modals";
import { FormSection, LocalizedTextInput } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  APPROVAL_CONDITION_FIELDS,
  CONDITION_OP_LABEL,
  type ConditionOp,
  conditionFieldDef,
  describeConditions,
  type FlowCondition,
  opsForType,
  validateConditions,
} from "@/lib/approval-conditions";
import { type ApprovalMode, validateFlowSteps } from "@/lib/approval-flow";
import type { ApprovalTargetType } from "@/lib/approval-targets";
import { approvalModeOptions } from "@/lib/enum-labels";
import type { GroupOption } from "./ApprovalFlowEditor";

/** 一覧に出すルール（サーバーで直列化した形）。 */
export interface FlowRuleView {
  id: number;
  nameJa: string;
  nameEn: string;
  /** 日本語以外の翻訳（LocalizedTextInput の多言語ポップアップ初期値）。 */
  nameTranslations: Record<string, string>;
  isActive: boolean;
  conditions: FlowCondition[];
  steps: {
    nameJa: string;
    nameEn: string;
    nameTranslations: Record<string, string>;
    groupId: string;
    mode: ApprovalMode;
  }[];
}

/** 動的選択肢（拠点など — サーバーでロードして渡す）。 */
export type ConditionDynamicOptions = Partial<
  Record<"plants", { value: string; label: string }[]>
>;

interface ConditionDraft {
  key: string;
  field: string | null;
  op: ConditionOp;
  /** number フィールドの値。 */
  numberValue: number | string;
  /** select フィールドの値。 */
  selectValue: string | null;
}

interface StepDraft {
  key: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  groupId: string | null;
  mode: ApprovalMode;
}

let seq = 0;
const nextKey = () => `rule-row-${++seq}`;

const emptyStep = (index: number): StepDraft => ({
  key: nextKey(),
  nameJa: `第${index}承認`,
  nameTranslations: {},
  groupId: null,
  mode: "ANY",
});

/** ドラフト → サーバー入力の条件形（不完全な行は validate で弾かれる）。 */
function toConditions(
  drafts: ConditionDraft[],
  targetType: ApprovalTargetType,
) {
  return drafts.map((d): FlowCondition => {
    const def = d.field ? conditionFieldDef(targetType, d.field) : undefined;
    const value =
      def?.type === "number"
        ? typeof d.numberValue === "number"
          ? d.numberValue
          : Number.NaN
        : (d.selectValue ?? "");
    return { field: d.field ?? "", op: d.op, value };
  });
}

export function ApprovalFlowRulesSection({
  targetType,
  targetLabel,
  rules,
  groupOptions,
  dynamicOptions,
}: {
  targetType: ApprovalTargetType;
  targetLabel: string;
  rules: FlowRuleView[];
  groupOptions: GroupOption[];
  dynamicOptions: ConditionDynamicOptions;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  // モーダルの編集対象（null = 閉。id null = 新規）。
  const [editing, setEditing] = useState<{ id: number | null } | null>(null);
  const [nameJa, setNameJa] = useState("");
  const [nameTranslations, setNameTranslations] = useState<
    Record<string, string>
  >({});
  const [conditions, setConditions] = useState<ConditionDraft[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([]);

  const fieldDefs = APPROVAL_CONDITION_FIELDS[targetType];
  const fieldOptions = fieldDefs.map((f) => ({ value: f.key, label: f.label }));

  const openNew = () => {
    setNameJa("");
    setNameTranslations({});
    setConditions([]);
    setSteps([emptyStep(1)]);
    setEditing({ id: null });
  };

  const openEdit = (rule: FlowRuleView) => {
    setNameJa(rule.nameJa);
    setNameTranslations(rule.nameTranslations);
    setConditions(
      rule.conditions.map((c) => {
        const def = conditionFieldDef(targetType, c.field);
        return {
          key: nextKey(),
          field: c.field,
          op: c.op,
          numberValue: def?.type === "number" ? Number(c.value) : "",
          selectValue: def?.type === "select" ? String(c.value) : null,
        };
      }),
    );
    setSteps(
      rule.steps.map((s) => ({
        key: nextKey(),
        nameJa: s.nameJa,
        nameTranslations: s.nameTranslations,
        groupId: s.groupId,
        mode: s.mode,
      })),
    );
    setEditing({ id: rule.id });
  };

  const condPayload = editing ? toConditions(conditions, targetType) : [];
  const issues = editing
    ? [
        ...(nameJa.trim()
          ? []
          : [tr("master.approvalFlows.enterTheRuleNameInJapanese")]),
        ...validateConditions(targetType, condPayload),
        ...validateFlowSteps(
          steps.map((s) => ({
            nameJa: s.nameJa,
            groupId: s.groupId ? Number(s.groupId) : null,
            mode: s.mode,
          })),
        ),
      ]
    : [];

  const save = () => {
    if (issues.length > 0) return;
    const payload: ApprovalFlowRuleInput = {
      nameJa: nameJa.trim(),
      nameTranslations,
      conditions: condPayload,
      steps: steps.map((s) => ({
        nameJa: s.nameJa.trim(),
        nameTranslations: s.nameTranslations,
        groupId: Number(s.groupId),
        mode: s.mode,
      })),
    };
    startTransition(async () => {
      const result = await saveApprovalFlowRule(
        targetType,
        editing?.id ?? null,
        payload,
      );
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: `${targetLabel}の条件付きフロー「${payload.nameJa}」`,
          color: "green",
        });
        setEditing(null);
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) router.refresh();
      else
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
    });

  /** 条件 1 行の値入力（フィールド型で出し分け）。 */
  const conditionValueInput = (c: ConditionDraft) => {
    const def = c.field ? conditionFieldDef(targetType, c.field) : undefined;
    if (!def)
      return (
        <TextInput disabled flex={1} placeholder={tr("common.selectAnItem")} />
      );
    if (def.type === "number") {
      return (
        <NumberInput
          flex={1}
          hideControls
          onChange={(v) =>
            setConditions((prev) =>
              prev.map((x) => (x.key === c.key ? { ...x, numberValue: v } : x)),
            )
          }
          placeholder={tr("common.value")}
          suffix={def.unit ? ` ${def.unit}` : undefined}
          thousandSeparator=","
          value={c.numberValue}
        />
      );
    }
    const options =
      def.options ??
      (def.optionsKey ? (dynamicOptions[def.optionsKey] ?? []) : []);
    return (
      <Select
        data={options}
        flex={1}
        onChange={(v) =>
          setConditions((prev) =>
            prev.map((x) => (x.key === c.key ? { ...x, selectValue: v } : x)),
          )
        }
        placeholder={tr("common.select")}
        searchable
        value={c.selectValue}
      />
    );
  };

  return (
    <>
      <FormSection
        description={tr("master.approvalFlows.branchesTheApprovalFlowOnThe")}
        title={tr("master.approvalFlows.conditionalFlow")}
      >
        <Stack gap="sm">
          {rules.length === 0 && (
            <Text c="dimmed" size="sm">
              条件付きフローはありません。すべての{targetLabel}
              が既定フローで進みます。
            </Text>
          )}
          {rules.map((rule, i) => (
            <Paper key={rule.id} p="sm" radius="sm" withBorder>
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Stack gap={4} style={{ minWidth: 0 }}>
                  <Group gap="xs" wrap="wrap">
                    <Badge color="indigo" size="sm" variant="light">
                      優先 {i + 1}
                    </Badge>
                    <Text fw={600} size="sm">
                      {rule.nameJa}
                    </Text>
                    {!rule.isActive && (
                      <Badge color="gray" size="xs" variant="light">
                        {tr("common.disabled3")}
                      </Badge>
                    )}
                  </Group>
                  <Text c="dimmed" size="xs">
                    {describeConditions(
                      targetType,
                      rule.conditions,
                      dynamicOptions,
                    )}
                  </Text>
                  <Text c="dimmed" size="xs">
                    段:{" "}
                    {rule.steps.map((s) => s.nameJa).join(" → ") ||
                      tr("common.notSet")}
                  </Text>
                </Stack>
                <Group gap={4} wrap="nowrap">
                  <Switch
                    checked={rule.isActive}
                    onChange={(e) =>
                      run(() =>
                        toggleApprovalFlowRule(
                          targetType,
                          rule.id,
                          e.currentTarget.checked,
                        ),
                      )
                    }
                    size="xs"
                  />
                  <ActionIcon
                    aria-label={tr("common.moveUp")}
                    disabled={i === 0 || isPending}
                    onClick={() =>
                      run(() => moveApprovalFlowRule(targetType, rule.id, "up"))
                    }
                    variant="subtle"
                  >
                    <IconArrowUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label={tr("common.moveDown")}
                    disabled={i === rules.length - 1 || isPending}
                    onClick={() =>
                      run(() =>
                        moveApprovalFlowRule(targetType, rule.id, "down"),
                      )
                    }
                    variant="subtle"
                  >
                    <IconArrowDown size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label={tr("common.edit2")}
                    onClick={() => openEdit(rule)}
                    variant="subtle"
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label="削除"
                    color="red"
                    onClick={() =>
                      openConfirm({
                        title: tr(
                          "master.approvalFlows.deleteTheConditionalFlow",
                        ),
                        message: `「${rule.nameJa}」を削除します。進行中の承認依頼には影響しません。`,
                        confirmLabel: "削除",
                        onConfirm: () =>
                          run(() =>
                            deleteApprovalFlowRule(targetType, rule.id),
                          ),
                      })
                    }
                    variant="subtle"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}
          <GhostButton fullWidth={isMobile} onClick={openNew}>
            {tr("master.approvalFlows.addAConditionalFlow")}
          </GhostButton>
        </Stack>
      </FormSection>

      <ModalShell
        confirmDisabled={issues.length > 0}
        confirmLabel={tr("common.save2")}
        loading={isPending}
        onClose={() => setEditing(null)}
        onConfirm={save}
        opened={editing != null}
        size="lg"
        title={
          editing?.id == null
            ? tr("master.approvalFlows.addAConditionalFlow")
            : tr("master.approvalFlows.editTheConditionalFlow")
        }
      >
        <Stack gap="md">
          <LocalizedTextInput
            jaProps={{
              value: nameJa,
              onChange: (e) => setNameJa(e.currentTarget.value),
            }}
            label={tr("master.approvalFlows.ruleName")}
            placeholder={tr("master.approvalFlows.eG500000AndAbove")}
            required
            translationsProps={{
              value: nameTranslations,
              onChange: (v: Record<string, string>) => setNameTranslations(v),
            }}
          />

          <Stack gap="xs">
            <Text fw={600} size="sm">
              {tr("master.approvalFlows.conditionsMatchesWhenAllAreMet")}
            </Text>
            {conditions.length === 0 && (
              <Text c="dimmed" size="xs">
                条件なし — すべての{targetLabel}に一致します（キャッチオール）。
              </Text>
            )}
            {conditions.map((c) => {
              const def = c.field
                ? conditionFieldDef(targetType, c.field)
                : undefined;
              const ops = def
                ? opsForType(def.type)
                : (["eq"] as ConditionOp[]);
              return (
                <Group align="flex-start" gap="xs" key={c.key} wrap="nowrap">
                  <Select
                    data={fieldOptions}
                    onChange={(v) =>
                      setConditions((prev) =>
                        prev.map((x) =>
                          x.key === c.key
                            ? {
                                ...x,
                                field: v,
                                op: "eq",
                                numberValue: "",
                                selectValue: null,
                              }
                            : x,
                        ),
                      )
                    }
                    placeholder={tr("common.item")}
                    value={c.field}
                    w={isMobile ? 130 : 180}
                  />
                  {conditionValueInput(c)}
                  <Select
                    data={ops.map((op) => ({
                      value: op,
                      label: CONDITION_OP_LABEL[op],
                    }))}
                    onChange={(v) =>
                      setConditions((prev) =>
                        prev.map((x) =>
                          x.key === c.key
                            ? { ...x, op: (v as ConditionOp) ?? "eq" }
                            : x,
                        ),
                      )
                    }
                    value={c.op}
                    w={isMobile ? 110 : 140}
                  />
                  <ActionIcon
                    aria-label={tr("master.approvalFlows.removeTheCondition")}
                    color="red"
                    mt={4}
                    onClick={() =>
                      setConditions((prev) =>
                        prev.filter((x) => x.key !== c.key),
                      )
                    }
                    variant="subtle"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              );
            })}
            <GhostButton
              onClick={() =>
                setConditions((prev) => [
                  ...prev,
                  {
                    key: nextKey(),
                    field: null,
                    op: "eq",
                    numberValue: "",
                    selectValue: null,
                  },
                ])
              }
            >
              {tr("master.approvalFlows.addACondition")}
            </GhostButton>
          </Stack>

          <Stack gap="xs">
            <Text fw={600} size="sm">
              {tr("master.approvalFlows.approvalStepsForThisRule")}
            </Text>
            {steps.map((s, i) => (
              <Paper key={s.key} p="xs" radius="sm" withBorder>
                <Group
                  align="flex-end"
                  gap="xs"
                  wrap={isMobile ? "wrap" : "nowrap"}
                >
                  <Badge color="blue" mb={6} size="sm" variant="light">
                    第{i + 1}段
                  </Badge>
                  <Box flex={1} miw={0}>
                    <LocalizedTextInput
                      jaProps={{
                        value: s.nameJa,
                        onChange: (e) => {
                          const value = e.currentTarget.value;
                          setSteps((prev) =>
                            prev.map((x) =>
                              x.key === s.key ? { ...x, nameJa: value } : x,
                            ),
                          );
                        },
                      }}
                      label={tr("common.name2")}
                      placeholder={tr("common.firstApproval")}
                      translationsProps={{
                        value: s.nameTranslations,
                        onChange: (value: Record<string, string>) =>
                          setSteps((prev) =>
                            prev.map((x) =>
                              x.key === s.key
                                ? { ...x, nameTranslations: value }
                                : x,
                            ),
                          ),
                      }}
                    />
                  </Box>
                  <Select
                    data={groupOptions}
                    label={tr("common.approvalGroup")}
                    onChange={(v) =>
                      setSteps((prev) =>
                        prev.map((x) =>
                          x.key === s.key ? { ...x, groupId: v } : x,
                        ),
                      )
                    }
                    placeholder={tr("common.select")}
                    searchable
                    value={s.groupId}
                    w={isMobile ? "100%" : 180}
                  />
                  <SegmentedControl
                    data={approvalModeOptions(locale)}
                    onChange={(v) =>
                      setSteps((prev) =>
                        prev.map((x) =>
                          x.key === s.key
                            ? { ...x, mode: v as ApprovalMode }
                            : x,
                        ),
                      )
                    }
                    value={s.mode}
                  />
                  <Group gap={2} mb={2} wrap="nowrap">
                    <ActionIcon
                      aria-label={tr("common.moveUp")}
                      disabled={i === 0}
                      onClick={() =>
                        setSteps((prev) => {
                          const next = [...prev];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          return next;
                        })
                      }
                      variant="subtle"
                    >
                      <IconArrowUp size={16} />
                    </ActionIcon>
                    <ActionIcon
                      aria-label={tr("common.moveDown")}
                      disabled={i === steps.length - 1}
                      onClick={() =>
                        setSteps((prev) => {
                          const next = [...prev];
                          [next[i], next[i + 1]] = [next[i + 1], next[i]];
                          return next;
                        })
                      }
                      variant="subtle"
                    >
                      <IconArrowDown size={16} />
                    </ActionIcon>
                    <ActionIcon
                      aria-label="削除"
                      color="red"
                      onClick={() =>
                        setSteps((prev) => prev.filter((x) => x.key !== s.key))
                      }
                      variant="subtle"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Paper>
            ))}
            <GhostButton
              onClick={() =>
                setSteps((prev) => [...prev, emptyStep(prev.length + 1)])
              }
            >
              {tr("common.addAStep")}
            </GhostButton>
          </Stack>

          {issues.length > 0 && (
            <Text c="red" size="xs">
              {issues.join(" / ")}
            </Text>
          )}
        </Stack>
      </ModalShell>
    </>
  );
}
