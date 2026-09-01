"use client";

/**
 * InspectionRecordForm — 検査記録の入力・表示 (design.md §12.5)。
 *
 * 記録方式はシート（テンプレート）単位:
 * - VALUES: **製品ごとのカード**を前へ/次へで送りながら、1 製品につき全項目の
 *   実測値を記録する（ページ数 = 検査対象の製品数。サンプル index = 製品番号
 *   なので values 配列は位置を保って送る）
 * - COUNTS: 項目ごとに検査数・合格数のみを記録する
 * 合否は合格基準からの自動判定を初期値に、項目の「手動上書き許可」に応じて
 * 上書きできる。判定表示は 3 状態（入力待ち / 自動判定 / 手動選択）で、
 * 未入力の間は合否コントロールを選択なし（グレー）にする。
 * 保存で InspectionRecord（全項目合格 = PASS / それ以外 = FAIL）+ 項目を作成。
 *
 * InspectionApprovalPanel — 検査承認工程用: 指示書全体の検査記録を一覧し、
 * PASS の記録を「承認」（APPROVED + approvedBy/At）する。
 */

import {
  ActionIcon,
  Badge,
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
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronLeft,
  IconChevronRight,
  IconFileTypePdf,
  IconPlus,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  approveInspectionRecord,
  confirmInspectionRecord,
  saveInspectionRecord,
} from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  ApproveButton,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { PdfButton } from "@/components/ui/PdfButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  acceptLabel,
  evaluateEntry,
  evaluateSample,
  goalLabel,
  type InspectionItemEntryData,
  type InspectionSampleValue,
  isEntryStarted,
  isSampleEmpty,
  requiredSampleCount,
  resolveItemPass,
  sampleLabel,
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

/** 既存の検査記録 1 件の読み取り専用表示。 */
function RecordSummary({
  record,
  onConfirm,
  confirming,
}: {
  record: InspectionRecordView;
  /** 「検査表確認」ボタンを出す（未確認のときだけ）。省略時はボタンを出さない。 */
  onConfirm?: () => void;
  confirming?: boolean;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
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
          記録: {fmt.dateTime(record.recordedAt)}
          {record.recordedByName ? `（${record.recordedByName}）` : ""}
        </Text>
        {record.approvedAt && (
          <Text c="dimmed" size="xs">
            承認: {fmt.dateTime(record.approvedAt)}
            {record.approvedByName ? `（${record.approvedByName}）` : ""}
          </Text>
        )}
        {record.confirmedAt ? (
          <Text c="dimmed" size="xs">
            検査表確認: {fmt.dateTime(record.confirmedAt)}
            {record.confirmedByName ? `（${record.confirmedByName}）` : ""}
          </Text>
        ) : (
          onConfirm && (
            <GhostButton loading={confirming} onClick={onConfirm} size="xs">
              {tr("production.inspectionRecordForm.inspectionSheetCheck")}
            </GhostButton>
          )
        )}
        <Tooltip
          label={tr(
            "production.inspectionRecordForm.showTheFilledInInspectionSheet",
          )}
          withinPortal
        >
          <ActionIcon
            aria-label={tr(
              "production.inspectionRecordForm.inspectionRecordPdf",
            )}
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
  sampleName,
}: {
  item: InspectionTemplateItemView;
  value: InspectionSampleValue;
  onChange: (v: InspectionSampleValue) => void;
  /** サンプルの見出し（inspection-core sampleLabel() の結果 — 製品N / 初品等）。 */
  sampleName: string;
}) {
  const tr = useTranslations();
  const label = `${item.name} — ${sampleName}`;
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
          placeholder={tr("common.select")}
          value={typeof value === "string" && value ? value : null}
          w={220}
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
          placeholder={tr("common.select")}
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
          w={160}
        />
      );
  }
}

/** 項目の判定コントロール + 3 状態の状態表示（VALUES/COUNTS 共通）。 */
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
  const tr = useTranslations();
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
            {
              value: "PASS",
              label: tr("production.inspectionRecordForm.pass"),
            },
            {
              value: "FAIL",
              label: tr("production.inspectionRecordForm.fail"),
            },
          ]}
          onChange={(v) => onManualPass(v === "PASS")}
          size="xs"
          value={showVerdict ? (pass ? "PASS" : "FAIL") : ""}
        />
      ) : (
        showVerdict && (
          <Badge color={pass ? "green" : "red"} variant="light">
            {pass ? "合格" : tr("production.inspectionRecordForm.fail")}
          </Badge>
        )
      )}
      <Text c="dimmed" size="xs">
        {!started
          ? style === "COUNTS"
            ? tr(
                "production.inspectionRecordForm.waitingForInspectedPassedCounts",
              )
            : tr("production.inspectionRecordForm.waitingForMeasuredValues")
          : auto == null
            ? tr(
                "production.inspectionRecordForm.cannotJudgeAutomaticallyChooseManually",
              )
            : entry.manualPass != null &&
                entry.manualPass !== auto &&
                item.allowManualOverride
              ? `自動判定（${auto ? "合格" : "不合格"}）を手動で上書き中`
              : `自動判定: ${auto ? "合格" : "不合格"}`}
      </Text>
    </Group>
  );
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
  /** 検査対象の製品数計算に使うロット数量（受入数 → 予定数量）。 */
  lotQuantity: number | null;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // key = `${templateId}:${itemId}`
  const [entries, setEntries] = useState<Record<string, ItemEntry>>({});
  // VALUES: 表示中の製品ページ（0 始まり）と、要求数不明時の手動ページ数
  const [pageByTemplate, setPageByTemplate] = useState<Record<number, number>>(
    {},
  );
  const [extraPages, setExtraPages] = useState<Record<number, number>>({});

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
      [`${template.id}:${item.id}`]: {
        ...entryOf(template, item),
        ...patch,
      },
    }));

  /** 製品ページの値（未入力ページは空サンプル）。 */
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

  /** 検査する製品数（要求数。不明なら手動追加ぶん）。 */
  const productCount = (template: InspectionTemplateView): number => {
    const required = requiredSampleCount(template, lotQuantity);
    return required ?? 1 + (extraPages[template.id] ?? 0);
  };

  const handleConfirm = (record: InspectionRecordView) => {
    startTransition(async () => {
      const result = await confirmInspectionRecord(
        workOrderNumber,
        stepId,
        record.id,
      );
      if (result.ok) {
        notifications.show({
          title: tr(
            "production.inspectionRecordForm.theInspectionSheetCheckWasRecorded",
          ),
          message: record.templateName,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message:
            result.errors?.join(" / ") ??
            tr(
              "production.inspectionRecordForm.couldNotRecordTheInspectionSheet",
            ),
          color: "red",
        });
      }
    });
  };

  const handleSave = (template: InspectionTemplateView) => {
    const style = template.recordStyle;
    const missing = template.items.filter((it) => {
      const entry = entryOf(template, it);
      return it.isRequired && !isEntryStarted(entry, style);
    });
    if (missing.length > 0) {
      notifications.show({
        title: tr("common.missingInput"),
        message: `必須項目を入力してください（${missing
          .map((m) => m.name)
          .join("・")}）`,
        color: "red",
      });
      return;
    }
    if (style === "COUNTS") {
      const invalid = template.items.filter((it) => {
        const entry = entryOf(template, it);
        return (
          entry.inspectedCount != null &&
          entry.passedCount != null &&
          entry.passedCount > entry.inspectedCount
        );
      });
      if (invalid.length > 0) {
        notifications.show({
          title: tr("common.inputError"),
          message: `合格数が検査数を超えています（${invalid
            .map((m) => m.name)
            .join("・")}）`,
          color: "red",
        });
        return;
      }
    }
    startTransition(async () => {
      const result = await saveInspectionRecord({
        workOrderNumber,
        stepId,
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
      if (result.ok) {
        notifications.show({
          title: tr("production.inspectionRecordForm.inspectionRecordSaved"),
          message: template.name,
          color: "green",
        });
        setEntries((prev) => {
          const next = { ...prev };
          for (const it of template.items)
            delete next[`${template.id}:${it.id}`];
          return next;
        });
        setPageByTemplate((prev) => ({ ...prev, [template.id]: 0 }));
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message:
            result.errors?.join(" / ") ??
            tr(
              "production.inspectionRecordForm.couldNotSaveTheInspectionRecord",
            ),
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>
          {tr("production.inspectionRecordForm.inspectionRecord")}
        </Title>

        {records.length > 0 && (
          <Stack gap="xs">
            {records.map((r) => (
              <RecordSummary
                confirming={isPending}
                key={r.id}
                onConfirm={canRecord ? () => handleConfirm(r) : undefined}
                record={r}
              />
            ))}
          </Stack>
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
                <Group gap="xs" justify="space-between" wrap="wrap">
                  <Group gap="xs" wrap="nowrap">
                    <Title order={5}>{template.name}</Title>
                    <Badge color="gray" size="sm" variant="outline">
                      v{template.version}
                    </Badge>
                    <Badge color="gray" size="sm" variant="light">
                      {samplingLabelJa(template, required)}
                    </Badge>
                    {style === "COUNTS" && (
                      <Badge color="cyan" size="sm" variant="light">
                        {tr("common.passCountOnly")}
                      </Badge>
                    )}
                  </Group>
                  <PdfButton
                    href={`/api/pdf/inspection-sheet?templateId=${template.id}&workOrder=${workOrderNumber}`}
                    label={tr(
                      "production.inspectionRecordForm.printABlankSheet",
                    )}
                  />
                </Group>

                {style === "COUNTS" ? (
                  // ── 合格数のみ: 項目ごとに検査数・合格数 ──
                  template.items.map((item) => {
                    const entry = entryOf(template, item);
                    const accept = acceptLabel(item);
                    const goal = goalLabel(item);
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
                          <Group align="flex-end" gap="xs" wrap="wrap">
                            <NumberInput
                              allowNegative={false}
                              label={tr(
                                "production.inspectionRecordForm.inspected",
                              )}
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
                              value={entry.inspectedCount ?? ""}
                              w={120}
                            />
                            <NumberInput
                              allowNegative={false}
                              label={tr(
                                "production.inspectionRecordForm.passed",
                              )}
                              min={0}
                              onChange={(v) =>
                                setEntry(template, item, {
                                  passedCount:
                                    v === "" || v == null ? null : Number(v),
                                })
                              }
                              value={entry.passedCount ?? ""}
                              w={120}
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
                                    ? tr(
                                        "production.inspectionRecordForm.passedCountExceedsInspectedCount",
                                      )
                                    : `不合格 ${entry.inspectedCount - entry.passedCount}`}
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
                  // ── 実測値: 製品ごとのカードをページ送り ──
                  <>
                    <Paper p="sm" radius="sm" withBorder>
                      <Stack gap="sm">
                        <Group justify="space-between" wrap="nowrap">
                          <SecondaryButton
                            disabled={page === 0}
                            leftSection={<IconChevronLeft size={14} />}
                            onClick={() => setPage(page - 1)}
                          >
                            {tr("production.inspectionRecordForm.previous")}
                          </SecondaryButton>
                          <Group gap="xs" wrap="nowrap">
                            <Text className="tabular-nums" fw={600} size="sm">
                              {sampleLabel(page, template.sampleNaming)} /{" "}
                              {pages}
                            </Text>
                            {required == null && (
                              <GhostButton
                                leftSection={<IconPlus size={12} />}
                                onClick={() => {
                                  setExtraPages((prev) => ({
                                    ...prev,
                                    [template.id]: (prev[template.id] ?? 0) + 1,
                                  }));
                                  setPage(pages);
                                }}
                                size="compact-sm"
                              >
                                {tr(
                                  "production.inspectionRecordForm.addProduct",
                                )}
                              </GhostButton>
                            )}
                          </Group>
                          <SecondaryButton
                            disabled={page >= pages - 1}
                            onClick={() => setPage(page + 1)}
                            rightSection={<IconChevronRight size={14} />}
                          >
                            {tr("production.inspectionRecordForm.next")}
                          </SecondaryButton>
                        </Group>
                        <Stack gap="xs">
                          {template.items.map((item) => {
                            const value = sampleAt(template, item, page);
                            const verdict = evaluateSample(item, value);
                            const accept = acceptLabel(item);
                            return (
                              <Group
                                align="center"
                                gap="sm"
                                justify="space-between"
                                key={item.id}
                                wrap="wrap"
                              >
                                <Stack gap={0} style={{ minWidth: 160 }}>
                                  <Text fw={600} size="sm">
                                    {item.name}
                                    {item.isRequired && (
                                      <Text c="red" component="span" size="sm">
                                        {" *"}
                                      </Text>
                                    )}
                                  </Text>
                                  {accept && (
                                    <Text c="dimmed" size="xs">
                                      合格: {accept}
                                    </Text>
                                  )}
                                </Stack>
                                <Group gap={6} wrap="nowrap">
                                  <SampleInput
                                    item={item}
                                    onChange={(v) =>
                                      setSampleAt(template, item, page, v)
                                    }
                                    sampleName={sampleLabel(
                                      page,
                                      template.sampleNaming,
                                    )}
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
                                    size="sm"
                                    w={16}
                                  >
                                    {verdict == null ? "" : verdict ? "○" : "×"}
                                  </Text>
                                </Group>
                              </Group>
                            );
                          })}
                        </Stack>
                      </Stack>
                    </Paper>

                    {/* 項目ごとの判定サマリ（全製品分の自動判定 + 手動上書き） */}
                    <Stack gap={6}>
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

                <Group justify="flex-end">
                  <PrimaryButton
                    loading={isPending}
                    onClick={() => handleSave(template)}
                  >
                    {tr("production.inspectionRecordForm.saveInspectionRecord")}
                  </PrimaryButton>
                </Group>
              </Stack>
            );
          })}

        {!canRecord && records.length === 0 && (
          <Text c="dimmed" size="sm">
            {tr("production.inspectionRecordForm.thereAreNoInspectionRecords")}
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
  const tr = useTranslations();
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
          title: tr(
            "production.inspectionRecordForm.theInspectionRecordWasApproved",
          ),
          message: record.templateName,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message:
            result.errors?.join(" / ") ??
            tr(
              "production.inspectionRecordForm.couldNotApproveTheInspectionRecord",
            ),
          color: "red",
        });
      }
    });
  };

  const handleConfirm = (record: InspectionRecordView) => {
    startTransition(async () => {
      const result = await confirmInspectionRecord(
        workOrderNumber,
        stepId,
        record.id,
      );
      if (result.ok) {
        notifications.show({
          title: tr(
            "production.inspectionRecordForm.theInspectionSheetCheckWasRecorded",
          ),
          message: record.templateName,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message:
            result.errors?.join(" / ") ??
            tr(
              "production.inspectionRecordForm.couldNotRecordTheInspectionSheet",
            ),
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>{tr("common.inspectionApproval")}</Title>
        {records.length === 0 ? (
          <Text c="dimmed" size="sm">
            {tr("production.inspectionRecordForm.thereIsNoInspectionRecordTo")}
          </Text>
        ) : (
          <Stack gap="xs">
            {records.map((r) => (
              <Group align="stretch" gap="sm" key={r.id} wrap="nowrap">
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <RecordSummary
                    confirming={isPending}
                    onConfirm={canApprove ? () => handleConfirm(r) : undefined}
                    record={r}
                  />
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
