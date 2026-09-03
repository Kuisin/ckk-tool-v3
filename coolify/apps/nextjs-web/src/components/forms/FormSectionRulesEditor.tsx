"use client";

/**
 * FormSectionRulesEditor — 1 セクションの分岐ルール（回答による遷移先の
 * 上書き）。ApprovalFlowRulesSection.tsx（条件付き承認フロー、MS0B）の条件
 * 行 UI を手本にしているが、こちらはモーダルではなくインライン ——
 * ビルダー全体が「公開するまで未保存」の状態なので、ルールごとに別保存する
 * 意味が無い。
 *
 * 条件の語彙・評価は lib/form-branching.ts / lib/approval-conditions.ts を
 * そのまま使う。ここは入力 UI だけを持つ。
 */

import {
  ActionIcon,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { GhostButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type ConditionOp,
  describeSectionRule,
  type FormSectionDef,
  type FormSectionRule,
  formConditionFieldOptions,
  opsForType,
  SECTION_SUBMIT,
} from "@/lib/form-branching";
import type { FormFieldDef } from "@/lib/form-schema";

function conditionOpLabels(
  tr: ReturnType<typeof useTranslations>,
): Record<ConditionOp, string> {
  return {
    eq: tr("master.approvalConditions.eq"),
    ne: tr("master.approvalConditions.ne"),
    gte: tr("master.approvalConditions.gte"),
    lte: tr("master.approvalConditions.lte"),
  };
}

export function FormSectionRulesEditor({
  section,
  sections,
  allFields,
  onChange,
}: {
  section: FormSectionDef;
  /** 並び順で全セクション（自分自身も含む）。 */
  sections: FormSectionDef[];
  /** フォーム全項目（セクション横断）。条件候補の絞り込みに使う。 */
  allFields: FormFieldDef[];
  onChange: (rules: FormSectionRule[]) => void;
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const opLabels = conditionOpLabels(tr);

  // 条件に使える項目は「このセクション以前（自分を含む）」の select/number
  // だけ — まだ聞いていない項目に条件を張れない。
  const conditionFields = formConditionFieldOptions(
    sections,
    section.key,
    allFields,
  );

  const targetOptions = [
    ...sections
      .map((s, i) => ({ ...s, displayIndex: i + 1 }))
      .filter((s) => s.key !== section.key)
      .map((s) => ({
        value: s.key,
        label: `${s.displayIndex}. ${s.title.ja || tr("common.unnamed")}`,
      })),
    {
      value: SECTION_SUBMIT,
      label: tr("general.formBranching.submitAndFinish"),
    },
  ];

  const addRule = () =>
    onChange([
      ...section.rules,
      { isActive: true, conditions: [], target: SECTION_SUBMIT },
    ]);

  const updateRule = (
    index: number,
    patch:
      | Partial<FormSectionRule>
      | ((rule: FormSectionRule) => Partial<FormSectionRule>),
  ) =>
    onChange(
      section.rules.map((r, i) =>
        i === index
          ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) }
          : r,
      ),
    );

  const removeRule = (index: number) =>
    onChange(section.rules.filter((_, i) => i !== index));

  const moveRule = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= section.rules.length) return;
    const next = [...section.rules];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  const addCondition = (ruleIndex: number) =>
    updateRule(ruleIndex, (rule) => ({
      conditions: [
        ...rule.conditions,
        { field: conditionFields[0]?.key ?? "", op: "eq", value: "" },
      ],
    }));

  const removeCondition = (ruleIndex: number, condIndex: number) =>
    updateRule(ruleIndex, (rule) => ({
      conditions: rule.conditions.filter((_, i) => i !== condIndex),
    }));

  const updateCondition = (
    ruleIndex: number,
    condIndex: number,
    patch: Partial<FormSectionRule["conditions"][number]>,
  ) =>
    updateRule(ruleIndex, (rule) => ({
      conditions: rule.conditions.map((c, i) =>
        i === condIndex ? { ...c, ...patch } : c,
      ),
    }));

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">
        {tr("forms.formSectionRules.title")}
      </Text>
      <Text c="dimmed" size="xs">
        {tr("forms.formSectionRules.description")}
      </Text>

      {section.rules.length === 0 && (
        <Text c="dimmed" size="xs">
          {tr("forms.formSectionRules.noRulesGoesInOrder")}
        </Text>
      )}

      {section.rules.map((rule, ruleIndex) => (
        <Paper
          // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
          key={ruleIndex}
          p="xs"
          radius="sm"
          withBorder
        >
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Text c="dimmed" size="xs">
                {describeSectionRule(rule, sections, allFields, tr)}
              </Text>
              <Group gap={2} wrap="nowrap">
                <Switch
                  checked={rule.isActive}
                  onChange={(e) =>
                    updateRule(ruleIndex, {
                      isActive: e.currentTarget.checked,
                    })
                  }
                  size="xs"
                />
                <ActionIcon
                  aria-label={tr("common.moveUp")}
                  disabled={ruleIndex === 0}
                  onClick={() => moveRule(ruleIndex, -1)}
                  variant="subtle"
                >
                  <IconArrowUp size={16} />
                </ActionIcon>
                <ActionIcon
                  aria-label={tr("common.moveDown")}
                  disabled={ruleIndex === section.rules.length - 1}
                  onClick={() => moveRule(ruleIndex, 1)}
                  variant="subtle"
                >
                  <IconArrowDown size={16} />
                </ActionIcon>
                <ActionIcon
                  aria-label={tr("forms.formSectionRules.removeTheRule")}
                  color="red"
                  onClick={() => removeRule(ruleIndex)}
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>

            {rule.conditions.map((cond, condIndex) => {
              const field = conditionFields.find((f) => f.key === cond.field);
              const ops = field
                ? opsForType(field.type === "number" ? "number" : "select")
                : (["eq"] as ConditionOp[]);
              return (
                <Group
                  align="flex-start"
                  gap="xs"
                  // biome-ignore lint/suspicious/noArrayIndexKey: 並び順が同一性
                  key={condIndex}
                  wrap="nowrap"
                >
                  <Select
                    data={conditionFields.map((f) => ({
                      value: f.key,
                      label: f.label.ja || f.key,
                    }))}
                    onChange={(v) =>
                      updateCondition(ruleIndex, condIndex, {
                        field: v ?? "",
                        op: "eq",
                        value: "",
                      })
                    }
                    placeholder={tr("common.item")}
                    value={cond.field || null}
                    w={isMobile ? 120 : 160}
                  />
                  {field?.type === "number" ? (
                    <NumberInput
                      flex={1}
                      hideControls
                      onChange={(v) =>
                        updateCondition(ruleIndex, condIndex, {
                          value: typeof v === "number" ? v : 0,
                        })
                      }
                      value={typeof cond.value === "number" ? cond.value : ""}
                    />
                  ) : (
                    <Select
                      data={(field?.options ?? []).map((o) => ({
                        value: o.value,
                        label: o.label.ja || o.value,
                      }))}
                      flex={1}
                      onChange={(v) =>
                        updateCondition(ruleIndex, condIndex, {
                          value: v ?? "",
                        })
                      }
                      placeholder={tr("common.select")}
                      value={typeof cond.value === "string" ? cond.value : null}
                    />
                  )}
                  <Select
                    data={ops.map((op) => ({ value: op, label: opLabels[op] }))}
                    onChange={(v) =>
                      updateCondition(ruleIndex, condIndex, {
                        op: (v as ConditionOp) ?? "eq",
                      })
                    }
                    value={cond.op}
                    w={isMobile ? 100 : 120}
                  />
                  <ActionIcon
                    aria-label={tr("forms.formSectionRules.removeTheCondition")}
                    color="red"
                    mt={4}
                    onClick={() => removeCondition(ruleIndex, condIndex)}
                    variant="subtle"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              );
            })}

            <Group justify="space-between" wrap="nowrap">
              <GhostButton
                disabled={conditionFields.length === 0}
                onClick={() => addCondition(ruleIndex)}
              >
                {tr("forms.formSectionRules.addACondition")}
              </GhostButton>
              <Select
                data={targetOptions}
                label={tr("forms.formSectionRules.goTo")}
                onChange={(v) =>
                  updateRule(ruleIndex, { target: v ?? SECTION_SUBMIT })
                }
                value={rule.target}
                w={isMobile ? 160 : 220}
              />
            </Group>
            {conditionFields.length === 0 && (
              <Text c="orange" size="xs">
                {tr("forms.formSectionRules.noConditionableFieldsYet")}
              </Text>
            )}
          </Stack>
        </Paper>
      ))}

      <Group>
        <GhostButton onClick={addRule}>
          {tr("forms.formSectionRules.addARule")}
        </GhostButton>
      </Group>
    </Stack>
  );
}
