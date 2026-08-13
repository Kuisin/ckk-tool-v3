"use client";

/**
 * StepInspectionForm.tsx — 検査記録の入力・表示（キオスク版 design.md §12.5）。
 *
 * nextjs-web の InspectionRecordForm と同じ業務規則（必須項目は 1 サンプル以上・
 * 全項目合格 = PASS / 1 つでも不合格 = FAIL）。項目の入力種別（真偽/数値/
 * 単一・複数選択）ごとの入力欄をサンプル行単位で出し、抜取（全数/割合/本数）の
 * 要求サンプル数を表示、合否は inspection-core（twin file）の自動判定を初期値に
 * 手動上書きできる。タブレット向けにテーブルではなく項目ごとの縦積みカード
 * （横スクロールを作らない・size="lg"）。検査承認はキオスクに持たない — 記録のみ。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KioskMessages } from "@/lib/i18n";
import {
  acceptLabel,
  type BoolLabels,
  evaluateEntry,
  evaluateSample,
  goalLabel,
  type InspectionSampleValue,
  isEntryStarted,
  isSampleEmpty,
  requiredSampleCount,
  resolveItemPass,
} from "@/lib/inspection-core";
import type {
  InspectionRecordView,
  InspectionTemplateItemView,
  InspectionTemplateView,
} from "@/lib/step-records";
import { useI18n } from "../I18nProvider";
import { callStepAction, translateError } from "./step-ui";

function statusColor(status: string): string {
  switch (status) {
    case "PASS":
      return "green";
    case "FAIL":
      return "red";
    case "APPROVED":
      return "teal";
    default:
      return "gray";
  }
}

function samplingLabel(
  m: KioskMessages,
  item: InspectionTemplateItemView,
  required: number | null,
): string {
  switch (item.samplingMode) {
    case "PERCENT":
      return m.steps.inspection.samplingPercent(
        item.samplingValue ?? 0,
        required,
      );
    case "COUNT":
      return m.steps.inspection.samplingCount(
        required ?? item.samplingValue ?? 0,
      );
    default:
      return m.steps.inspection.samplingAll;
  }
}

/** 既存の検査記録 1 件の読み取り専用表示。 */
function RecordSummary({ record }: { record: InspectionRecordView }) {
  const { m, locale } = useI18n();
  const statusTable = m.steps.inspection.status as Record<string, string>;
  const at = record.recordedAt
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(record.recordedAt))
    : "";
  return (
    <Paper p="sm" radius="sm" withBorder>
      <Group gap="sm" wrap="wrap">
        <Text fw={600} size="sm">
          {record.templateName}
        </Text>
        <Badge color={statusColor(record.status)} size="md" variant="light">
          {statusTable[record.status] ?? record.status}
        </Badge>
        <Text c="dimmed" size="xs">
          {m.steps.inspection.recordedMeta(at, record.recordedByName ?? "")}
        </Text>
      </Group>
      {record.items.length > 0 && (
        <Group gap="xs" mt="xs" wrap="wrap">
          {record.items.map((it) => (
            <Badge
              color={it.isPass === false ? "red" : "green"}
              key={`${record.id}:${it.itemName}`}
              size="md"
              variant="light"
            >
              {it.itemName}: {it.valueLabel ?? "—"}
            </Badge>
          ))}
        </Group>
      )}
    </Paper>
  );
}

interface ItemEntry {
  samples: InspectionSampleValue[];
  /** 記録方式 COUNTS: 検査数 / 合格数。 */
  inspectedCount: number | null;
  passedCount: number | null;
  /** 手動上書き（null = 自動判定に従う）。 */
  manualPass: boolean | null;
}

/** 抜取行の初期本数（要求数が多くても入力欄はまず 10 行まで）。 */
const INITIAL_ROWS_CAP = 10;

function emptySample(item: InspectionTemplateItemView): InspectionSampleValue {
  return item.inputType === "SELECT_MULTI" ? [] : "";
}

function initialSamples(
  item: InspectionTemplateItemView,
  lotQuantity: number | null,
): InspectionSampleValue[] {
  if (item.samplingMode === "ALL") return [emptySample(item)];
  const required = requiredSampleCount(item, lotQuantity);
  const n = Math.max(1, Math.min(required ?? 1, INITIAL_ROWS_CAP));
  return Array.from({ length: n }, () => emptySample(item));
}

/** 項目の実効合否（inspection-core resolveItemPass — サーバー保存と同一規則）。 */
function effectivePass(
  item: InspectionTemplateItemView,
  entry: ItemEntry,
): boolean {
  return resolveItemPass(item, entry, entry.manualPass);
}

function SampleInput({
  item,
  value,
  onChange,
  index,
  bool,
  placeholder,
  locale,
}: {
  item: InspectionTemplateItemView;
  value: InspectionSampleValue;
  onChange: (v: InspectionSampleValue) => void;
  index: number;
  bool: BoolLabels;
  placeholder: string;
  locale: string;
}) {
  const label = `${item.name} #${index + 1}`;
  const optionData = item.options.map((o) => ({
    value: o.value,
    label: o.label[locale] || o.label.ja || o.value,
  }));
  switch (item.inputType) {
    case "BOOLEAN":
      return (
        <SegmentedControl
          aria-label={label}
          data={[
            { value: "true", label: bool.yes },
            { value: "false", label: bool.no },
          ]}
          onChange={(v) => onChange(v)}
          size="lg"
          value={typeof value === "string" ? value : ""}
        />
      );
    case "SELECT_SINGLE":
      return (
        <Select
          aria-label={label}
          clearable
          data={optionData}
          onChange={(v) => onChange(v ?? "")}
          placeholder={placeholder}
          size="lg"
          style={{ flex: 1, minWidth: 180 }}
          value={typeof value === "string" && value ? value : null}
        />
      );
    case "SELECT_MULTI":
      return (
        <MultiSelect
          aria-label={label}
          data={optionData}
          onChange={(v) => onChange(v)}
          placeholder={placeholder}
          size="lg"
          style={{ flex: 1, minWidth: 220 }}
          value={Array.isArray(value) ? value : []}
        />
      );
    default:
      return (
        <TextInput
          aria-label={label}
          inputMode="decimal"
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={placeholder}
          rightSection={
            item.unit ? (
              <Text c="dimmed" size="sm">
                {item.unit}
              </Text>
            ) : undefined
          }
          size="lg"
          style={{ flex: 1, minWidth: 140 }}
          value={typeof value === "string" ? value : ""}
        />
      );
  }
}

type Props = {
  stepId: string;
  templates: InspectionTemplateView[];
  records: InspectionRecordView[];
  /** 作業中 / 一時停止中のみ true（完了・他人セッションでは読み取り専用）。 */
  canRecord: boolean;
  /** 抜取の要求サンプル数計算に使うロット数量（受入数 → 想定受入数 → 予定数量）。 */
  lotQuantity: number | null;
};

export function StepInspectionForm({
  stepId,
  templates,
  records,
  canRecord,
  lotQuantity,
}: Props) {
  const router = useRouter();
  const { m, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTemplate, setSavedTemplate] = useState<string | null>(null);
  // key = `${templateId}:${itemId}`
  const [entries, setEntries] = useState<Record<string, ItemEntry>>({});

  const bool: BoolLabels = {
    yes: m.steps.inspection.yes,
    no: m.steps.inspection.no,
  };

  const entryOf = (
    template: InspectionTemplateView,
    item: InspectionTemplateItemView,
  ): ItemEntry =>
    entries[`${template.id}:${item.id}`] ?? {
      samples: initialSamples(item, lotQuantity),
      inspectedCount: null,
      passedCount: null,
      manualPass: null,
    };

  const setEntry = (
    template: InspectionTemplateView,
    item: InspectionTemplateItemView,
    patch: Partial<ItemEntry>,
  ) =>
    setEntries((prev) => ({
      ...prev,
      [`${template.id}:${item.id}`]: { ...entryOf(template, item), ...patch },
    }));

  const save = async (template: InspectionTemplateView) => {
    setError(null);
    setSavedTemplate(null);
    const missing = template.items.some((it) => {
      const entry = entryOf(template, it);
      return it.isRequired && !isEntryStarted(it, entry);
    });
    if (missing) {
      setError(m.steps.inspection.requiredMissing);
      return;
    }
    const countsOver = template.items.some((it) => {
      const entry = entryOf(template, it);
      return (
        it.recordStyle === "COUNTS" &&
        entry.inspectedCount != null &&
        entry.passedCount != null &&
        entry.passedCount > entry.inspectedCount
      );
    });
    if (countsOver) {
      setError(m.steps.inspection.countsOver);
      return;
    }
    setBusy(true);
    const res = await callStepAction(stepId, {
      action: "INSPECTION",
      templateId: template.id,
      items: template.items.map((it) => {
        const entry = entryOf(template, it);
        const isCounts = it.recordStyle === "COUNTS";
        return {
          templateItemId: it.id,
          values: isCounts
            ? []
            : entry.samples.filter((s) => !isSampleEmpty(s)),
          inspectedCount: isCounts ? entry.inspectedCount : null,
          passedCount: isCounts ? entry.passedCount : null,
          isPass: effectivePass(it, entry),
        };
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(translateError(m, res));
      return;
    }
    // 入力をクリアして記録一覧を出し直す
    setEntries((prev) => {
      const next = { ...prev };
      for (const it of template.items) delete next[`${template.id}:${it.id}`];
      return next;
    });
    setSavedTemplate(template.name);
    router.refresh();
  };

  if (templates.length === 0 && records.length === 0) return null;

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>{m.steps.inspection.title}</Title>

        {records.length > 0 && (
          <Stack gap="xs">
            {records.map((r) => (
              <RecordSummary key={r.id} record={r} />
            ))}
          </Stack>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={20} />}>
            {error}
          </Alert>
        )}
        {savedTemplate && (
          <Alert color="green" icon={<IconCheck size={20} />}>
            {m.steps.inspection.saved}
          </Alert>
        )}

        {canRecord && templates.length === 0 && (
          <Text c="dimmed" size="sm">
            {m.steps.inspection.noTemplates}
          </Text>
        )}

        {canRecord &&
          templates.map((template) => (
            <Stack gap="sm" key={template.id}>
              <Group gap="xs" wrap="wrap">
                <Title order={5}>{template.name}</Title>
                <Badge color="gray" size="sm" variant="outline">
                  v{template.version}
                </Badge>
              </Group>
              {template.items.map((item) => {
                const entry = entryOf(template, item);
                const accept = acceptLabel(item, locale, bool);
                const goal = goalLabel(item, locale, bool);
                const required = requiredSampleCount(item, lotQuantity);
                const auto = evaluateEntry(item, entry);
                const started = isEntryStarted(item, entry);
                const pass = effectivePass(item, entry);
                const isCounts = item.recordStyle === "COUNTS";
                return (
                  <Paper key={item.id} p="sm" radius="sm" withBorder>
                    <Stack gap="xs">
                      <Group gap="xs" wrap="wrap">
                        <Text fw={600}>{item.name}</Text>
                        {item.isRequired && (
                          <Badge color="red" size="sm" variant="light">
                            {m.steps.inspection.required}
                          </Badge>
                        )}
                        <Badge color="gray" size="sm" variant="light">
                          {samplingLabel(m, item, required)}
                        </Badge>
                        {accept && (
                          <Text c="dimmed" size="sm">
                            {m.steps.inspection.accept(accept)}
                          </Text>
                        )}
                        {goal && (
                          <Text c="dimmed" size="sm">
                            {m.steps.inspection.goal(goal)}
                          </Text>
                        )}
                      </Group>

                      {isCounts && (
                        <Group align="flex-end" gap="sm" wrap="wrap">
                          <NumberInput
                            allowNegative={false}
                            label={m.steps.inspection.inspectedCount}
                            min={0}
                            onChange={(v) =>
                              setEntry(template, item, {
                                inspectedCount:
                                  v === "" || v == null ? null : Number(v),
                              })
                            }
                            placeholder={
                              required != null ? String(required) : undefined
                            }
                            size="lg"
                            value={entry.inspectedCount ?? ""}
                            w={140}
                          />
                          <NumberInput
                            allowNegative={false}
                            label={m.steps.inspection.passedCount}
                            min={0}
                            onChange={(v) =>
                              setEntry(template, item, {
                                passedCount:
                                  v === "" || v == null ? null : Number(v),
                              })
                            }
                            size="lg"
                            value={entry.passedCount ?? ""}
                            w={140}
                          />
                          {entry.inspectedCount != null &&
                            entry.passedCount != null && (
                              <Text
                                c={
                                  entry.passedCount > entry.inspectedCount
                                    ? "red"
                                    : "dimmed"
                                }
                                size="sm"
                              >
                                {entry.passedCount > entry.inspectedCount
                                  ? m.steps.inspection.countsOver
                                  : m.steps.inspection.failCount(
                                      entry.inspectedCount - entry.passedCount,
                                    )}
                              </Text>
                            )}
                        </Group>
                      )}

                      {!isCounts &&
                        entry.samples.map((sample, idx) => {
                          const verdict = evaluateSample(item, sample);
                          return (
                            <Group
                              align="center"
                              gap="sm"
                              // biome-ignore lint/suspicious/noArrayIndexKey: 行は追加/削除のみで並べ替えない
                              key={idx}
                              wrap="nowrap"
                            >
                              <SampleInput
                                bool={bool}
                                index={idx}
                                item={item}
                                locale={locale}
                                onChange={(v) =>
                                  setEntry(template, item, {
                                    samples: entry.samples.map((s, i) =>
                                      i === idx ? v : s,
                                    ),
                                  })
                                }
                                placeholder={
                                  item.inputType === "NUMBER"
                                    ? m.steps.inspection.measured
                                    : m.steps.inspection.selectPlaceholder
                                }
                                value={sample}
                              />
                              {verdict != null && (
                                <Text
                                  c={verdict ? "green" : "red"}
                                  fw={700}
                                  size="lg"
                                >
                                  {verdict ? "○" : "×"}
                                </Text>
                              )}
                              {entry.samples.length > 1 && (
                                <ActionIcon
                                  aria-label={`${item.name} #${idx + 1} — ${m.steps.inspection.removeRow}`}
                                  color="gray"
                                  onClick={() =>
                                    setEntry(template, item, {
                                      samples: entry.samples.filter(
                                        (_, i) => i !== idx,
                                      ),
                                    })
                                  }
                                  size="lg"
                                  variant="subtle"
                                >
                                  <IconX size={18} />
                                </ActionIcon>
                              )}
                            </Group>
                          );
                        })}
                      <Group justify="space-between" wrap="wrap">
                        {isCounts ? (
                          <span />
                        ) : (
                          <Button
                            leftSection={<IconPlus size={16} />}
                            onClick={() =>
                              setEntry(template, item, {
                                samples: [...entry.samples, emptySample(item)],
                              })
                            }
                            size="sm"
                            variant="subtle"
                          >
                            {m.steps.inspection.addRow}
                          </Button>
                        )}
                        <Group gap="xs" wrap="wrap">
                          {item.allowManualOverride ? (
                            <SegmentedControl
                              color={pass ? "green" : "red"}
                              data={[
                                {
                                  value: "PASS",
                                  label: m.steps.inspection.pass,
                                },
                                {
                                  value: "FAIL",
                                  label: m.steps.inspection.fail,
                                },
                              ]}
                              onChange={(v) =>
                                setEntry(template, item, {
                                  manualPass: v === "PASS",
                                })
                              }
                              size="lg"
                              value={pass ? "PASS" : "FAIL"}
                            />
                          ) : (
                            started && (
                              <Badge
                                color={pass ? "green" : "red"}
                                size="lg"
                                variant="light"
                              >
                                {pass
                                  ? m.steps.inspection.pass
                                  : m.steps.inspection.fail}
                              </Badge>
                            )
                          )}
                          <Text c="dimmed" size="xs">
                            {!started
                              ? isCounts
                                ? m.steps.inspection.waitingCounts
                                : m.steps.inspection.waitingValues
                              : auto == null
                                ? m.steps.inspection.autoNone
                                : entry.manualPass != null &&
                                    entry.manualPass !== auto &&
                                    item.allowManualOverride
                                  ? m.steps.inspection.autoOverridden(auto)
                                  : m.steps.inspection.autoVerdict(auto)}
                          </Text>
                        </Group>
                      </Group>
                    </Stack>
                  </Paper>
                );
              })}
              <Button fullWidth loading={busy} onClick={() => save(template)}>
                {m.steps.inspection.save}
              </Button>
            </Stack>
          ))}
      </Stack>
    </Paper>
  );
}
