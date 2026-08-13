"use client";

/**
 * InspectionRecordForm — 検査記録の入力・表示 (design.md §12.5)。
 *
 * コンパクト表示（テーマ既定 size="sm" — 現場タブレットはキオスク側）。
 * 工程に対応する検査表テンプレートごとに、項目の入力種別（真偽/数値/単一・
 * 複数選択）に応じた入力欄をサンプル行単位で出す。抜取（全数/割合/本数）の
 * 要求サンプル数を表示し、行の追加・削除で測定した本数分を記録する。
 * 合否は合格基準からの自動判定を初期値に、手動で上書きできる。
 * 保存で InspectionRecord（全項目合格 = PASS / それ以外 = FAIL）+ 項目を作成。
 * 既存記録は読み取り専用で一覧表示。
 *
 * InspectionApprovalPanel — 検査承認工程用: 指示書全体の検査記録を一覧し、
 * PASS の記録を「承認」（APPROVED + approvedBy/At）する。
 */

import {
  ActionIcon,
  Badge,
  Group,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileTypePdf, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveInspectionRecord,
  saveInspectionRecord,
} from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import {
  ApproveButton,
  GhostButton,
  PrimaryButton,
} from "@/components/ui/buttons";
import { PdfButton } from "@/components/ui/PdfButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import {
  acceptLabel,
  evaluateItem,
  evaluateSample,
  goalLabel,
  type InspectionSampleValue,
  isSampleEmpty,
  requiredSampleCount,
  samplingLabelJa,
} from "@/lib/inspection-core";
import type {
  InspectionRecordView,
  InspectionTemplateItemView,
  InspectionTemplateView,
} from "./step-execution/model";

const BOOL_SEGMENT = [
  { value: "true", label: "はい" },
  { value: "false", label: "いいえ" },
];

/** 抜取行の初期本数（要求数が多くても入力欄はまず 10 行まで）。 */
const INITIAL_ROWS_CAP = 10;

function initialSamples(
  item: InspectionTemplateItemView,
  lotQuantity: number | null,
): InspectionSampleValue[] {
  const empty: InspectionSampleValue =
    item.inputType === "SELECT_MULTI" ? [] : "";
  if (item.samplingMode === "ALL") return [empty];
  const required = requiredSampleCount(item, lotQuantity);
  const n = Math.max(1, Math.min(required ?? 1, INITIAL_ROWS_CAP));
  return Array.from({ length: n }, () =>
    item.inputType === "SELECT_MULTI" ? [] : "",
  );
}

/** 既存の検査記録 1 件の読み取り専用表示。 */
function RecordSummary({ record }: { record: InspectionRecordView }) {
  return (
    <Paper p="sm" radius="sm" withBorder>
      <Group gap="sm" wrap="wrap">
        {record.stepName && (
          <Text fw={600} size="sm">
            {record.stepName}
          </Text>
        )}
        <Text size="sm">{record.templateName}</Text>
        <StatusBadge entity="InspectionRecord" status={record.status} />
        <Text c="dimmed" size="xs">
          記録: {formatDateTime(record.recordedAt)}
          {record.recordedByName ? `（${record.recordedByName}）` : ""}
        </Text>
        {record.approvedAt && (
          <Text c="dimmed" size="xs">
            承認: {formatDateTime(record.approvedAt)}
            {record.approvedByName ? `（${record.approvedByName}）` : ""}
          </Text>
        )}
        <Tooltip label="記入済み検査表を PDF で表示" withinPortal>
          <ActionIcon
            aria-label="検査記録 PDF"
            color="gray"
            component="a"
            href={`/api/pdf/inspection-record?id=${record.id}`}
            rel="noopener noreferrer"
            target="_blank"
            variant="subtle"
          >
            <IconFileTypePdf size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {record.items.length > 0 && (
        <Group gap="sm" mt="xs" wrap="wrap">
          {record.items.map((it) => (
            <Badge
              color={it.isPass === false ? "red" : "green"}
              key={it.templateItemId}
              size="sm"
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

// ── 記録モード（検査工程） ───────────────────────────────────────────────────

interface ItemEntry {
  samples: InspectionSampleValue[];
  /** 手動上書き（null = 自動判定に従う）。 */
  manualPass: boolean | null;
}

/** 項目の実効合否 — 手動上書き > 自動判定 > 既定 合格。 */
function effectivePass(
  item: InspectionTemplateItemView,
  entry: ItemEntry,
): boolean {
  if (entry.manualPass != null) return entry.manualPass;
  return evaluateItem(item, entry.samples) ?? true;
}

function SampleInput({
  item,
  value,
  onChange,
  index,
}: {
  item: InspectionTemplateItemView;
  value: InspectionSampleValue;
  onChange: (v: InspectionSampleValue) => void;
  index: number;
}) {
  const label = `${item.name} #${index + 1}`;
  switch (item.inputType) {
    case "BOOLEAN":
      return (
        <SegmentedControl
          aria-label={label}
          data={BOOL_SEGMENT}
          onChange={(v) => onChange(v)}
          value={typeof value === "string" ? value : ""}
        />
      );
    case "SELECT_SINGLE":
      return (
        <Select
          aria-label={label}
          clearable
          data={item.options.map((o) => ({
            value: o.value,
            label: o.label.ja ?? o.value,
          }))}
          onChange={(v) => onChange(v ?? "")}
          placeholder="選択"
          value={typeof value === "string" && value ? value : null}
          w={200}
        />
      );
    case "SELECT_MULTI":
      return (
        <MultiSelect
          aria-label={label}
          data={item.options.map((o) => ({
            value: o.value,
            label: o.label.ja ?? o.value,
          }))}
          onChange={(v) => onChange(v)}
          placeholder="選択"
          value={Array.isArray(value) ? value : []}
          w={260}
        />
      );
    default:
      return (
        <TextInput
          aria-label={label}
          inputMode="decimal"
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder="実測値"
          rightSection={
            item.unit ? (
              <Text c="dimmed" size="xs">
                {item.unit}
              </Text>
            ) : undefined
          }
          value={typeof value === "string" ? value : ""}
          w={140}
        />
      );
  }
}

export function InspectionRecordForm({
  workOrderNumber,
  stepId,
  templates,
  records,
  canRecord,
  lotQuantity,
}: {
  workOrderNumber: number;
  stepId: string;
  templates: InspectionTemplateView[];
  /** この工程の既存記録。 */
  records: InspectionRecordView[];
  /** 進行中 & セッション保有時のみ true。 */
  canRecord: boolean;
  /** 抜取の要求サンプル数計算に使うロット数量（受入数 → 予定数量）。 */
  lotQuantity: number | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // key = `${templateId}:${itemId}`
  const [entries, setEntries] = useState<Record<string, ItemEntry>>({});

  const entryOf = (
    template: InspectionTemplateView,
    item: InspectionTemplateItemView,
  ): ItemEntry =>
    entries[`${template.id}:${item.id}`] ?? {
      samples: initialSamples(item, lotQuantity),
      manualPass: null,
    };

  const setEntry = (
    template: InspectionTemplateView,
    item: InspectionTemplateItemView,
    patch: Partial<ItemEntry>,
  ) =>
    setEntries((prev) => ({
      ...prev,
      [`${template.id}:${item.id}`]: {
        ...entryOf(template, item),
        ...patch,
      },
    }));

  const handleSave = (template: InspectionTemplateView) => {
    const missing = template.items.filter((it) => {
      const entry = entryOf(template, it);
      return it.isRequired && entry.samples.every((s) => isSampleEmpty(s));
    });
    if (missing.length > 0) {
      notifications.show({
        title: "入力不足",
        message: `必須項目の実測値を入力してください（${missing
          .map((m) => m.name)
          .join("・")}）`,
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await saveInspectionRecord({
        workOrderNumber,
        stepId,
        templateId: template.id,
        items: template.items.map((it) => {
          const entry = entryOf(template, it);
          return {
            templateItemId: it.id,
            values: entry.samples.filter((s) => !isSampleEmpty(s)),
            isPass: effectivePass(it, entry),
          };
        }),
      });
      if (result.ok) {
        notifications.show({
          title: "検査記録を保存しました",
          message: template.name,
          color: "green",
        });
        setEntries((prev) => {
          const next = { ...prev };
          for (const it of template.items)
            delete next[`${template.id}:${it.id}`];
          return next;
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "検査記録の保存に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>検査記録</Title>

        {records.length > 0 && (
          <Stack gap="xs">
            {records.map((r) => (
              <RecordSummary key={r.id} record={r} />
            ))}
          </Stack>
        )}

        {canRecord &&
          templates.map((template) => (
            <Stack gap="sm" key={template.id}>
              <Group gap="xs" justify="space-between" wrap="wrap">
                <Group gap="xs" wrap="nowrap">
                  <Title order={5}>{template.name}</Title>
                  <Badge color="gray" size="sm" variant="outline">
                    v{template.version}
                  </Badge>
                </Group>
                <PdfButton
                  href={`/api/pdf/inspection-sheet?templateId=${template.id}&workOrder=${workOrderNumber}`}
                  label="空欄シートを印刷"
                />
              </Group>
              {template.items.map((item) => {
                const entry = entryOf(template, item);
                const accept = acceptLabel(item);
                const goal = goalLabel(item);
                const required = requiredSampleCount(item, lotQuantity);
                const auto = evaluateItem(item, entry.samples);
                const pass = effectivePass(item, entry);
                return (
                  <Paper key={item.id} p="sm" radius="sm" withBorder>
                    <Stack gap="xs">
                      <Group gap="xs" wrap="wrap">
                        <Text fw={600} size="sm">
                          {item.name}
                          {item.isRequired && (
                            <Text c="red" component="span" size="sm">
                              {" *"}
                            </Text>
                          )}
                        </Text>
                        <Badge color="gray" size="sm" variant="light">
                          {samplingLabelJa(item, required)}
                        </Badge>
                        {accept && (
                          <Text c="dimmed" size="xs">
                            合格: {accept}
                          </Text>
                        )}
                        {goal && (
                          <Text c="dimmed" size="xs">
                            目標: {goal}
                          </Text>
                        )}
                      </Group>

                      <Group align="center" gap="xs" wrap="wrap">
                        {entry.samples.map((sample, idx) => {
                          const verdict = evaluateSample(item, sample);
                          return (
                            <Group
                              gap={4}
                              // biome-ignore lint/suspicious/noArrayIndexKey: 行は追加/削除のみで並べ替えない
                              key={idx}
                              wrap="nowrap"
                            >
                              <SampleInput
                                index={idx}
                                item={item}
                                onChange={(v) =>
                                  setEntry(template, item, {
                                    samples: entry.samples.map((s, i) =>
                                      i === idx ? v : s,
                                    ),
                                  })
                                }
                                value={sample}
                              />
                              {verdict != null && (
                                <Text
                                  c={verdict ? "green" : "red"}
                                  fw={700}
                                  size="sm"
                                >
                                  {verdict ? "○" : "×"}
                                </Text>
                              )}
                              {entry.samples.length > 1 && (
                                <Tooltip label="行を削除" withinPortal>
                                  <ActionIcon
                                    aria-label={`${item.name} #${idx + 1} を削除`}
                                    color="gray"
                                    onClick={() =>
                                      setEntry(template, item, {
                                        samples: entry.samples.filter(
                                          (_, i) => i !== idx,
                                        ),
                                      })
                                    }
                                    size="sm"
                                    variant="subtle"
                                  >
                                    <IconTrash size={12} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </Group>
                          );
                        })}
                        <GhostButton
                          leftSection={<IconPlus size={12} />}
                          onClick={() =>
                            setEntry(template, item, {
                              samples: [
                                ...entry.samples,
                                item.inputType === "SELECT_MULTI" ? [] : "",
                              ],
                            })
                          }
                          size="compact-sm"
                        >
                          行を追加
                        </GhostButton>
                      </Group>

                      <Group gap="xs" wrap="wrap">
                        <SegmentedControl
                          color={pass ? "green" : "red"}
                          data={[
                            { value: "PASS", label: "合格" },
                            { value: "FAIL", label: "不合格" },
                          ]}
                          onChange={(v) =>
                            setEntry(template, item, {
                              manualPass: v === "PASS",
                            })
                          }
                          size="xs"
                          value={pass ? "PASS" : "FAIL"}
                        />
                        <Text c="dimmed" size="xs">
                          {auto == null
                            ? "自動判定なし（手動で選択）"
                            : entry.manualPass != null &&
                                entry.manualPass !== auto
                              ? `自動判定（${auto ? "合格" : "不合格"}）を手動で上書き中`
                              : `自動判定: ${auto ? "合格" : "不合格"}`}
                        </Text>
                      </Group>
                    </Stack>
                  </Paper>
                );
              })}
              <Group justify="flex-end">
                <PrimaryButton
                  loading={isPending}
                  onClick={() => handleSave(template)}
                >
                  検査記録を保存
                </PrimaryButton>
              </Group>
            </Stack>
          ))}

        {!canRecord && records.length === 0 && (
          <Text c="dimmed" size="sm">
            検査記録はありません
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

// ── 承認モード（検査承認工程） ───────────────────────────────────────────────

export function InspectionApprovalPanel({
  workOrderNumber,
  stepId,
  records,
  canApprove,
}: {
  workOrderNumber: number;
  stepId: string;
  /** 指示書全体の検査記録（stepName 付き）。 */
  records: InspectionRecordView[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleApprove = (record: InspectionRecordView) => {
    startTransition(async () => {
      const result = await approveInspectionRecord(
        workOrderNumber,
        stepId,
        record.id,
      );
      if (result.ok) {
        notifications.show({
          title: "検査記録を承認しました",
          message: record.templateName,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "検査記録の承認に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>検査承認</Title>
        {records.length === 0 ? (
          <Text c="dimmed" size="sm">
            承認対象の検査記録がありません（先に検査工程で記録してください）
          </Text>
        ) : (
          <Stack gap="xs">
            {records.map((r) => (
              <Group align="stretch" gap="sm" key={r.id} wrap="nowrap">
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <RecordSummary record={r} />
                </Stack>
                {canApprove && r.status === "PASS" && (
                  <ApproveButton
                    loading={isPending}
                    onClick={() => handleApprove(r)}
                  />
                )}
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
