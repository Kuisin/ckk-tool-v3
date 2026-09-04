"use client";

/**
 * StepInspectionForm.tsx — 検査記録の入力・表示（キオスク版 design.md §12.5）。
 *
 * nextjs-web の InspectionRecordForm と同じ業務規則。記録方式はシート単位:
 * - VALUES: 製品ごとのカードを前へ/次へで送りながら全項目を記録
 *   （ページ数 = 検査対象の製品数。values 配列は位置 = 製品番号）
 * - COUNTS: 項目ごとに検査数・合格数のみ
 * 合否は自動判定を初期値に、項目の「手動上書き許可」に応じて上書き。
 * 未入力の間は合否コントロールを選択なし（グレー）にする。
 * ページ見出しはテンプレートのサンプル呼称（製品N / 初品・中間品・最終品）に
 * 従う — 紙の検査表が「初品」と呼ぶ 1 枚目を画面が「製品 1」と呼ぶと
 * 突き合わせられないため。
 * タブレット向け縦積み・size="lg"。
 *
 * 検査表確認（confirmedBy — 記入内容を第三者が見たという印）はここで押せる。
 * **検査承認（APPROVED への遷移）はキオスクに持たない** — 別ロールなので
 * web の管理画面のみ。
 */

import {
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
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fillMessage, type KioskMessages } from "@/lib/i18n";
import {
  acceptLabel,
  type BoolLabels,
  evaluateEntry,
  evaluateSample,
  goalLabel,
  type InspectionItemEntryData,
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
  template: InspectionTemplateView,
  required: number | null,
): string {
  switch (template.samplingMode) {
    case "PERCENT":
      return required != null
        ? fillMessage(m.steps.inspection.samplingPercentWithCount, {
            pct: template.samplingValue ?? 0,
            count: required,
          })
        : fillMessage(m.steps.inspection.samplingPercent, {
            pct: template.samplingValue ?? 0,
          });
    case "COUNT":
      return fillMessage(m.steps.inspection.samplingCount, {
        count: required ?? template.samplingValue ?? 0,
      });
    default:
      return m.steps.inspection.samplingAll;
  }
}

/**
 * サンプルページの見出し（製品 N / 初品・中間品・最終品）。
 * inspection-core（twin file）の sampleLabel は ja 固定なので、キオスクは
 * 自分の辞書から同じ規則で組み立てる（web の inspection-labels.ts と同じ形）。
 */
function sampleLabel(
  m: KioskMessages,
  index: number,
  naming: InspectionTemplateView["sampleNaming"],
): string {
  if (naming === "INITIAL_MID_FINAL") {
    if (index === 0) return m.steps.inspection.sampleInitial;
    if (index === 1) return m.steps.inspection.sampleMid;
    if (index === 2) return m.steps.inspection.sampleFinal;
  }
  return fillMessage(m.steps.inspection.sampleGeneric, { n: index + 1 });
}

/** 既存の検査記録 1 件の読み取り専用表示。 */
function RecordSummary({
  record,
  onConfirm,
  busy,
}: {
  record: InspectionRecordView;
  /** 検査表確認ボタンを出す（未確認かつ記録できるときだけ）。 */
  onConfirm?: () => void;
  busy?: boolean;
}) {
  const { m, locale } = useI18n();
  const statusTable = m.steps.inspection.status as Record<string, string>;
  const fmtAt = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  const at = record.recordedAt ? fmtAt(record.recordedAt) : "";
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
          {fillMessage(m.steps.inspection.recordedMeta, {
            at,
            by: record.recordedByName ?? "",
          })}
        </Text>
        {record.confirmedAt ? (
          <Text c="dimmed" size="xs">
            {fillMessage(m.steps.inspection.confirmedMeta, {
              at: fmtAt(record.confirmedAt),
              by: record.confirmedByName ?? "",
            })}
          </Text>
        ) : (
          onConfirm && (
            <Button
              loading={busy}
              onClick={onConfirm}
              size="compact-md"
              variant="light"
            >
              {m.steps.inspection.confirmSheet}
            </Button>
          )
        )}
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

interface ItemEntry extends InspectionItemEntryData {
  samples: InspectionSampleValue[];
  /** 手動上書き（null = 自動判定に従う）。 */
  manualPass: boolean | null;
}

function emptySample(item: InspectionTemplateItemView): InspectionSampleValue {
  return item.inputType === "SELECT_MULTI" ? [] : "";
}

function SampleInput({
  item,
  value,
  onChange,
  bool,
  placeholder,
  locale,
}: {
  item: InspectionTemplateItemView;
  value: InspectionSampleValue;
  onChange: (v: InspectionSampleValue) => void;
  bool: BoolLabels;
  placeholder: string;
  locale: string;
}) {
  const optionData = item.options.map((o) => ({
    value: o.value,
    label: o.label[locale] || o.label.ja || o.value,
  }));
  switch (item.inputType) {
    case "BOOLEAN":
      return (
        <SegmentedControl
          aria-label={item.name}
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
          aria-label={item.name}
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
          aria-label={item.name}
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
          aria-label={item.name}
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

/** 項目の判定コントロール + 3 状態の状態表示。 */
function ItemVerdict({
  item,
  entry,
  style,
  onManualPass,
}: {
  item: InspectionTemplateItemView;
  entry: ItemEntry;
  style: "VALUES" | "COUNTS";
  onManualPass: (pass: boolean) => void;
}) {
  const { m } = useI18n();
  const auto = evaluateEntry(item, entry, style);
  const started = isEntryStarted(entry, style);
  const pass = resolveItemPass(item, entry, entry.manualPass, style);
  // 未入力かつ手動未選択の間は選択なし（グレー）で表示する
  const showVerdict = started || entry.manualPass != null;
  return (
    <Group gap="xs" wrap="wrap">
      {item.allowManualOverride ? (
        <SegmentedControl
          color={showVerdict ? (pass ? "green" : "red") : undefined}
          data={[
            { value: "PASS", label: m.steps.inspection.pass },
            { value: "FAIL", label: m.steps.inspection.fail },
          ]}
          onChange={(v) => onManualPass(v === "PASS")}
          size="lg"
          value={showVerdict ? (pass ? "PASS" : "FAIL") : ""}
        />
      ) : (
        showVerdict && (
          <Badge color={pass ? "green" : "red"} size="lg" variant="light">
            {pass ? m.steps.inspection.pass : m.steps.inspection.fail}
          </Badge>
        )
      )}
      <Text c="dimmed" size="xs">
        {!started
          ? style === "COUNTS"
            ? m.steps.inspection.waitingCounts
            : m.steps.inspection.waitingValues
          : auto == null
            ? m.steps.inspection.autoNone
            : entry.manualPass != null &&
                entry.manualPass !== auto &&
                item.allowManualOverride
              ? auto
                ? m.steps.inspection.autoOverriddenPass
                : m.steps.inspection.autoOverriddenFail
              : auto
                ? m.steps.inspection.autoVerdictPass
                : m.steps.inspection.autoVerdictFail}
      </Text>
    </Group>
  );
}

type Props = {
  stepId: string;
  templates: InspectionTemplateView[];
  records: InspectionRecordView[];
  /** 作業中 / 一時停止中のみ true（完了・他人セッションでは読み取り専用）。 */
  canRecord: boolean;
  /** 検査対象の製品数計算に使うロット数量（受入数 → 想定受入数 → 予定数量）。 */
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
  const [pageByTemplate, setPageByTemplate] = useState<Record<number, number>>(
    {},
  );
  const [extraPages, setExtraPages] = useState<Record<number, number>>({});

  const bool: BoolLabels = {
    yes: m.steps.inspection.yes,
    no: m.steps.inspection.no,
  };

  const entryOf = (
    template: InspectionTemplateView,
    item: InspectionTemplateItemView,
  ): ItemEntry =>
    entries[`${template.id}:${item.id}`] ?? {
      samples: [],
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

  const sampleAt = (
    template: InspectionTemplateView,
    item: InspectionTemplateItemView,
    page: number,
  ): InspectionSampleValue =>
    entryOf(template, item).samples[page] ?? emptySample(item);

  const setSampleAt = (
    template: InspectionTemplateView,
    item: InspectionTemplateItemView,
    page: number,
    value: InspectionSampleValue,
  ) => {
    const entry = entryOf(template, item);
    const samples = [...entry.samples];
    while (samples.length <= page) samples.push(emptySample(item));
    samples[page] = value;
    setEntry(template, item, { samples });
  };

  const productCount = (template: InspectionTemplateView): number => {
    const required = requiredSampleCount(template, lotQuantity);
    return required ?? 1 + (extraPages[template.id] ?? 0);
  };

  const save = async (template: InspectionTemplateView) => {
    const style = template.recordStyle;
    setError(null);
    setSavedTemplate(null);
    const missing = template.items.some((it) => {
      const entry = entryOf(template, it);
      return it.isRequired && !isEntryStarted(entry, style);
    });
    if (missing) {
      setError(m.steps.inspection.requiredMissing);
      return;
    }
    if (style === "COUNTS") {
      const over = template.items.some((it) => {
        const entry = entryOf(template, it);
        return (
          entry.inspectedCount != null &&
          entry.passedCount != null &&
          entry.passedCount > entry.inspectedCount
        );
      });
      if (over) {
        setError(m.steps.inspection.countsOver);
        return;
      }
    }
    setBusy(true);
    const res = await callStepAction(stepId, {
      action: "INSPECTION",
      templateId: template.id,
      items: template.items.map((it) => {
        const entry = entryOf(template, it);
        // values は位置 = 製品番号なので詰めずに送る（末尾の空のみ削除）
        const samples = [...entry.samples];
        while (
          samples.length > 0 &&
          isSampleEmpty(samples[samples.length - 1])
        ) {
          samples.pop();
        }
        return {
          templateItemId: it.id,
          values: style === "COUNTS" ? [] : samples,
          inspectedCount: style === "COUNTS" ? entry.inspectedCount : null,
          passedCount: style === "COUNTS" ? entry.passedCount : null,
          isPass: resolveItemPass(it, entry, entry.manualPass, style),
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
    setPageByTemplate((prev) => ({ ...prev, [template.id]: 0 }));
    setSavedTemplate(template.name);
    router.refresh();
  };

  /** 検査表確認（記入内容を第三者が見たという印 — 承認ではない）。 */
  const confirmSheet = async (recordId: string) => {
    setError(null);
    setSavedTemplate(null);
    setBusy(true);
    const res = await callStepAction(stepId, {
      action: "INSPECTION_CONFIRM",
      recordId,
    });
    setBusy(false);
    if (!res.ok) {
      setError(translateError(m, res));
      return;
    }
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
              <RecordSummary
                busy={busy}
                key={r.id}
                onConfirm={canRecord ? () => confirmSheet(r.id) : undefined}
                record={r}
              />
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
          templates.map((template) => {
            const style = template.recordStyle;
            const required = requiredSampleCount(template, lotQuantity);
            const pages = productCount(template);
            const page = Math.min(
              pageByTemplate[template.id] ?? 0,
              Math.max(pages - 1, 0),
            );
            const setPage = (next: number) =>
              setPageByTemplate((prev) => ({
                ...prev,
                [template.id]: Math.max(0, Math.min(next, pages - 1)),
              }));
            return (
              <Stack gap="sm" key={template.id}>
                <Group gap="xs" wrap="wrap">
                  <Title order={5}>{template.name}</Title>
                  <Badge color="gray" size="sm" variant="outline">
                    v{template.version}
                  </Badge>
                  <Badge color="gray" size="md" variant="light">
                    {samplingLabel(m, template, required)}
                  </Badge>
                </Group>

                {style === "COUNTS" ? (
                  template.items.map((item) => {
                    const entry = entryOf(template, item);
                    const accept = acceptLabel(item, locale, bool);
                    const goal = goalLabel(item, locale, bool);
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
                            {accept && (
                              <Text c="dimmed" size="sm">
                                {fillMessage(m.steps.inspection.accept, {
                                  label: accept,
                                })}
                              </Text>
                            )}
                            {goal && (
                              <Text c="dimmed" size="sm">
                                {fillMessage(m.steps.inspection.goal, {
                                  label: goal,
                                })}
                              </Text>
                            )}
                          </Group>
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
                                    : fillMessage(
                                        m.steps.inspection.failCount,
                                        {
                                          n:
                                            entry.inspectedCount -
                                            entry.passedCount,
                                        },
                                      )}
                                </Text>
                              )}
                          </Group>
                          <ItemVerdict
                            entry={entry}
                            item={item}
                            onManualPass={(pass) =>
                              setEntry(template, item, { manualPass: pass })
                            }
                            style={style}
                          />
                        </Stack>
                      </Paper>
                    );
                  })
                ) : (
                  <>
                    <Paper p="sm" radius="sm" withBorder>
                      <Stack gap="sm">
                        <Group justify="space-between" wrap="nowrap">
                          <Button
                            disabled={page === 0}
                            leftSection={<IconChevronLeft size={18} />}
                            onClick={() => setPage(page - 1)}
                            variant="default"
                          >
                            {m.steps.inspection.prevProduct}
                          </Button>
                          <Group gap="xs" wrap="nowrap">
                            <Text className="tabular-nums" fw={600}>
                              {fillMessage(m.steps.inspection.samplePage, {
                                label: sampleLabel(
                                  m,
                                  page,
                                  template.sampleNaming,
                                ),
                                n: pages,
                              })}
                            </Text>
                            {required == null && (
                              <Button
                                leftSection={<IconPlus size={14} />}
                                onClick={() => {
                                  setExtraPages((prev) => ({
                                    ...prev,
                                    [template.id]: (prev[template.id] ?? 0) + 1,
                                  }));
                                  setPage(pages);
                                }}
                                size="compact-sm"
                                variant="subtle"
                              >
                                {m.steps.inspection.addProduct}
                              </Button>
                            )}
                          </Group>
                          <Button
                            disabled={page >= pages - 1}
                            onClick={() => setPage(page + 1)}
                            rightSection={<IconChevronRight size={18} />}
                            variant="default"
                          >
                            {m.steps.inspection.nextProduct}
                          </Button>
                        </Group>
                        <Stack gap="sm">
                          {template.items.map((item) => {
                            const value = sampleAt(template, item, page);
                            const verdict = evaluateSample(item, value);
                            const accept = acceptLabel(item, locale, bool);
                            return (
                              <Stack gap={4} key={item.id}>
                                <Group gap="xs" wrap="wrap">
                                  <Text fw={600}>{item.name}</Text>
                                  {item.isRequired && (
                                    <Badge
                                      color="red"
                                      size="sm"
                                      variant="light"
                                    >
                                      {m.steps.inspection.required}
                                    </Badge>
                                  )}
                                  {accept && (
                                    <Text c="dimmed" size="sm">
                                      {fillMessage(m.steps.inspection.accept, {
                                        label: accept,
                                      })}
                                    </Text>
                                  )}
                                </Group>
                                <Group align="center" gap="sm" wrap="nowrap">
                                  <SampleInput
                                    bool={bool}
                                    item={item}
                                    locale={locale}
                                    onChange={(v) =>
                                      setSampleAt(template, item, page, v)
                                    }
                                    placeholder={
                                      item.inputType === "NUMBER"
                                        ? m.steps.inspection.measured
                                        : m.steps.inspection.selectPlaceholder
                                    }
                                    value={value}
                                  />
                                  <Text
                                    c={
                                      verdict == null
                                        ? "dimmed"
                                        : verdict
                                          ? "green"
                                          : "red"
                                    }
                                    fw={700}
                                    size="lg"
                                    w={20}
                                  >
                                    {verdict == null ? "" : verdict ? "○" : "×"}
                                  </Text>
                                </Group>
                              </Stack>
                            );
                          })}
                        </Stack>
                      </Stack>
                    </Paper>

                    <Stack gap={6}>
                      <Text c="dimmed" fw={600} size="sm">
                        {m.steps.inspection.verdictTitle}
                      </Text>
                      {template.items.map((item) => {
                        const entry = entryOf(template, item);
                        return (
                          <Group
                            gap="sm"
                            justify="space-between"
                            key={item.id}
                            wrap="wrap"
                          >
                            <Text size="sm">{item.name}</Text>
                            <ItemVerdict
                              entry={entry}
                              item={item}
                              onManualPass={(pass) =>
                                setEntry(template, item, { manualPass: pass })
                              }
                              style={style}
                            />
                          </Group>
                        );
                      })}
                    </Stack>
                  </>
                )}

                <Button fullWidth loading={busy} onClick={() => save(template)}>
                  {m.steps.inspection.save}
                </Button>
              </Stack>
            );
          })}
      </Stack>
    </Paper>
  );
}
