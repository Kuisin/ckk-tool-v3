/**
 * step-records.ts — 工程の検査記録・不良記録（読み取り + 書き込み）。server-only.
 *
 * PR #272 で意図的に nextjs-web 側へ残していた 2 機能のキオスク版。
 * nextjs-web の saveInspectionRecord / saveDefectRecords（work-orders/[id]/steps/
 * [stepId]/actions.ts）と同じ業務規則で書く:
 * - 検査記録: 進行中（IN_PROGRESS）の工程のみ。全項目合格 = PASS / 1 つでも
 *   不合格 = FAIL。テンプレートは指示書に紐付くもの（work_order_inspection_
 *   templates）のみ・工程の関連工程が一致（または未設定）のもののみ表示。
 *   項目は入力種別（真偽/数値/単一・複数選択）ごとにサンプル値配列
 *   （measured_values）で記録し、値は inspection-core（twin file）で検証する。
 * - 不良記録: 種類 + 内容の複数行まとめ追加。
 * **検査承認（APPROVED への遷移）はキオスクに持たない** — 承認は nextjs-web の
 * 管理画面のみ。
 *
 * ロックの扱いは completeStepExecution と同じ「null か自分」— 一時停止中
 * （PAUSED = ロック解放）でも記録できる。完了が PAUSED から押せる以上、
 * 完了前提の検査記録も同じ条件で書けるべきなので。
 */

import { recordAudit } from "./audit";
import { prisma } from "./db";
import type { LocalizedText } from "./format";
import { localized } from "./format";
import type { Locale } from "./i18n";
import {
  type BoolLabels,
  formatCounts,
  formatSampleValue,
  type InspectionItemSpec,
  type InspectionSampleValue,
  isSampleEmpty,
  itemSpecFromRow,
  parseStoredSamples,
  resolveItemPass,
  samplingSpecFromRow,
} from "./inspection-core";
import type { StepActionResult, StepErrorCode } from "./step-execution";
import { inspectionOutcome } from "./steps-core";

const fail = (code: StepErrorCode, ...errors: string[]): StepActionResult => ({
  ok: false,
  codes: [code],
  errors: errors.length > 0 ? errors : undefined,
});

/** 実測値表示のはい/いいえ（ロケール別）。 */
const BOOL_LABELS: Record<Locale, BoolLabels> = {
  ja: { yes: "はい", no: "いいえ" },
  en: { yes: "Yes", no: "No" },
  zh: { yes: "是", no: "否" },
};

// ── 読み取り（実行画面に出すデータ） ─────────────────────────────────────────

/** 検査項目（inspection-core の判定 spec + 表示名）。 */
export interface InspectionTemplateItemView extends InspectionItemSpec {
  name: string;
}

export interface InspectionTemplateView {
  id: number;
  code: string;
  version: number;
  name: string;
  /** 検査対象・記録方式（シート単位）。 */
  samplingMode: "ALL" | "PERCENT" | "COUNT";
  samplingValue: number | null;
  recordStyle: "VALUES" | "COUNTS";
  items: InspectionTemplateItemView[];
}

export interface InspectionRecordView {
  id: string;
  templateName: string;
  status: string;
  recordedAt: string | null;
  recordedByName: string | null;
  items: {
    itemName: string;
    /** 実測値の表示文字列（複数サンプルは " / " 連結。未入力は null）。 */
    valueLabel: string | null;
    isPass: boolean | null;
  }[];
}

export interface DefectTypeView {
  id: number;
  name: string;
}

export interface DefectRecordView {
  id: string;
  defectTypeName: string;
  description: string;
  recordedAt: string;
  recordedByName: string | null;
}

export interface StepRecordingData {
  /** 検査工程か（カタログ is_inspection）。 */
  isInspection: boolean;
  /** この工程で使う検査表テンプレート（関連工程が一致 or 未設定）。 */
  templates: InspectionTemplateView[];
  /** この工程の既存検査記録（新しい順）。 */
  inspectionRecords: InspectionRecordView[];
  /** 有効な不良種類。 */
  defectTypes: DefectTypeView[];
  /** この工程の既存不良記録（新しい順）。 */
  defectRecords: DefectRecordView[];
}

function asText(value: unknown): LocalizedText | null {
  return (value ?? null) as LocalizedText | null;
}

/** 実行画面の検査・不良セクションに必要なデータをまとめて引く。 */
export async function getStepRecordingData(
  stepId: string,
  locale: Locale,
): Promise<StepRecordingData | null> {
  const step = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    select: {
      workOrderId: true,
      processStepId: true,
      processStep: { select: { isInspection: true } },
    },
  });
  if (!step) return null;

  const [templateLinks, records, defectTypes, defects] = await Promise.all([
    prisma.workOrderInspectionTemplate.findMany({
      where: { workOrderId: step.workOrderId },
      include: {
        inspectionTemplate: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    prisma.inspectionRecord.findMany({
      where: { workOrderStepId: stepId },
      include: {
        template: { select: { name: true } },
        items: { include: { templateItem: true } },
      },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.defectType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.defectRecord.findMany({
      where: { workOrderStepId: stepId },
      include: { defectType: { select: { name: true } } },
      orderBy: { recordedAt: "desc" },
    }),
  ]);

  // recorded_by の表示名解決（キオスクユーザーも同じ app.users 空間）
  const userIds = [
    ...new Set(
      [
        ...records.map((r) => r.recordedBy),
        ...defects.map((d) => d.recordedBy),
      ].filter((id): id is string => id != null),
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null) =>
    id ? (users.find((u) => u.id === id)?.displayName ?? null) : null;

  const bool = BOOL_LABELS[locale];

  // 実測値の表示（合格数のみ → 合格 n/m、新形式 measured_values は型別
  // フォーマット、旧形式は生値）
  const passLabel = locale === "en" ? "Pass" : "合格";
  const valueLabel = (it: {
    measuredValue: string | null;
    measuredValues: unknown;
    inspectedCount: number | null;
    passedCount: number | null;
    templateItem: Parameters<typeof itemSpecFromRow>[0];
  }): string | null => {
    if (it.inspectedCount != null || it.passedCount != null) {
      return formatCounts(it.inspectedCount, it.passedCount, passLabel);
    }
    const samples = parseStoredSamples(it.measuredValues);
    if (samples.length === 0) return it.measuredValue;
    const spec = itemSpecFromRow(it.templateItem);
    return samples
      .map((s) => formatSampleValue(spec, s, locale, bool))
      .join(" / ");
  };

  return {
    isInspection: step.processStep.isInspection,
    // 関連工程がこの工程 or 未設定（汎用）のテンプレートのみ（web 側と同じ規則）
    templates: templateLinks
      .filter(
        (t) =>
          t.inspectionTemplate.relatedProcessStepId == null ||
          t.inspectionTemplate.relatedProcessStepId === step.processStepId,
      )
      .map((t) => ({
        id: t.inspectionTemplate.id,
        code: t.inspectionTemplate.code,
        version: t.inspectionTemplate.version,
        name: localized(asText(t.inspectionTemplate.name), locale),
        ...samplingSpecFromRow(t.inspectionTemplate),
        items: t.inspectionTemplate.items.map((it) => ({
          name: localized(asText(it.itemName), locale),
          ...itemSpecFromRow(it),
        })),
      })),
    inspectionRecords: records.map((r) => ({
      id: r.id,
      templateName: localized(asText(r.template.name), locale),
      status: r.status,
      recordedAt: r.recordedAt?.toISOString() ?? null,
      recordedByName: nameOf(r.recordedBy),
      items: r.items.map((it) => ({
        itemName: localized(asText(it.templateItem.itemName), locale),
        valueLabel: valueLabel(it),
        isPass: it.isPass,
      })),
    })),
    defectTypes: defectTypes.map((d) => ({
      id: d.id,
      name: localized(asText(d.name), locale),
    })),
    defectRecords: defects.map((d) => ({
      id: d.id,
      defectTypeName: localized(asText(d.defectType.name), locale),
      description: d.description,
      recordedAt: d.recordedAt.toISOString(),
      recordedByName: nameOf(d.recordedBy),
    })),
  };
}

// ── 書き込み ─────────────────────────────────────────────────────────────────

/** 記録系操作の共通前提: 進行中 + ロックが null か自分。 */
async function findRecordableStep(stepId: string, actorId: string) {
  const step = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    select: {
      id: true,
      status: true,
      sessionLockedBy: true,
      sortOrder: true,
      workOrderId: true,
      workOrder: { select: { workOrderNumber: true } },
    },
  });
  if (!step) return { error: fail("NOT_FOUND", "工程が見つかりません") };
  if (step.status !== "IN_PROGRESS") {
    return {
      error: fail("NOT_IN_PROGRESS", "進行中の工程でのみ記録できます"),
    };
  }
  if (step.sessionLockedBy && step.sessionLockedBy !== actorId) {
    return {
      error: fail("LOCK_HELD_BY_OTHER", "別のユーザーがセッション中です"),
    };
  }
  return { step };
}

export interface InspectionItemInput {
  templateItemId: number;
  /** サンプル値配列（SELECT_MULTI は value[]、他は文字列）。 */
  values: InspectionSampleValue[];
  /** 記録方式 COUNTS: 検査数・合格数（VALUES は null）。 */
  inspectedCount: number | null;
  passedCount: number | null;
  isPass: boolean;
}

/**
 * 検査記録の保存 — 全項目合格なら PASS、1 つでも不合格なら FAIL。
 * テンプレートは指示書に紐付くもののみ・項目はそのテンプレートの項目のみ。
 * サンプル値は型検証（選択肢 membership・真偽エンコード）し、合否は
 * resolveItemPass でサーバー側でも解決（上書き不可の項目は自動判定を強制）
 * — nextjs-web saveInspectionRecord と同一規則。
 */
export async function recordInspection(
  stepId: string,
  actorId: string,
  templateId: number,
  items: InspectionItemInput[],
): Promise<StepActionResult> {
  if (items.length === 0) {
    return fail("ITEMS_REQUIRED", "検査項目がありません");
  }
  const found = await findRecordableStep(stepId, actorId);
  if (found.error) return found.error;
  const step = found.step;

  // テンプレートが指示書に紐付いているか + 項目 id・サンプル値が妥当か
  const link = await prisma.workOrderInspectionTemplate.findUnique({
    where: {
      workOrderId_inspectionTemplateId: {
        workOrderId: step.workOrderId,
        inspectionTemplateId: templateId,
      },
    },
    include: { inspectionTemplate: { include: { items: true } } },
  });
  if (!link) {
    return fail("TEMPLATE_INVALID", "この指示書の検査表ではありません");
  }
  // 記録方式・検査対象はシート（テンプレート）単位
  const style = link.inspectionTemplate.recordStyle;
  const specs = new Map(
    link.inspectionTemplate.items.map((it) => [it.id, itemSpecFromRow(it)]),
  );
  for (const i of items) {
    const spec = specs.get(i.templateItemId);
    if (!spec) {
      return fail("TEMPLATE_INVALID", "検査項目がテンプレートと一致しません");
    }
    const optionValues = new Set(spec.options.map((o) => o.value));
    for (const s of i.values) {
      const values = Array.isArray(s) ? s : [s];
      if (
        (spec.inputType === "SELECT_SINGLE" ||
          spec.inputType === "SELECT_MULTI") &&
        !values.every((x) => x === "" || optionValues.has(x))
      ) {
        return fail("TEMPLATE_INVALID", "選択肢にない値が含まれています");
      }
      if (
        spec.inputType === "BOOLEAN" &&
        !values.every((x) => x === "" || x === "true" || x === "false")
      ) {
        return fail("TEMPLATE_INVALID", "真偽項目の値が不正です");
      }
    }
    if (
      style === "COUNTS" &&
      i.inspectedCount != null &&
      i.passedCount != null &&
      i.passedCount > i.inspectedCount
    ) {
      return fail("ITEMS_REQUIRED", "合格数が検査数を超えています");
    }
  }

  // 合否はサーバーでも解決 — 上書き不可の項目はクライアント値を無視して
  // 自動判定を強制（resolveItemPass — web 側と同一規則）。
  // values は位置 = 製品番号なので詰めない（末尾の空のみ削除）。
  const resolved = items.map((i) => {
    const spec = specs.get(i.templateItemId);
    const isCounts = style === "COUNTS";
    const samples = [...i.values];
    while (samples.length > 0 && isSampleEmpty(samples[samples.length - 1])) {
      samples.pop();
    }
    const entryData = {
      samples,
      inspectedCount: isCounts ? i.inspectedCount : null,
      passedCount: isCounts ? i.passedCount : null,
    };
    return {
      templateItemId: i.templateItemId,
      measuredValues: isCounts ? [] : samples,
      inspectedCount: entryData.inspectedCount,
      passedCount: entryData.passedCount,
      isPass: spec
        ? resolveItemPass(spec, entryData, i.isPass, style)
        : i.isPass,
    };
  });
  const status = inspectionOutcome(resolved);
  await prisma.inspectionRecord.create({
    data: {
      workOrderStepId: stepId,
      templateId,
      status,
      recordedBy: actorId,
      recordedAt: new Date(),
      items: { create: resolved },
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(step.workOrder.workOrderNumber),
    after: {
      note: `検査記録を保存（${status === "PASS" ? "合格" : "不合格"} / ${items.length} 項目）`,
    },
  });
  return { ok: true };
}

export interface DefectInput {
  defectTypeId: number;
  description: string;
}

/** 不良記録の保存（複数行まとめて追加）。 */
export async function recordDefects(
  stepId: string,
  actorId: string,
  defects: DefectInput[],
): Promise<StepActionResult> {
  if (defects.length === 0) {
    return fail("ITEMS_REQUIRED", "不良記録がありません");
  }
  const found = await findRecordableStep(stepId, actorId);
  if (found.error) return found.error;
  const step = found.step;

  const typeIds = [...new Set(defects.map((d) => d.defectTypeId))];
  const types = await prisma.defectType.findMany({
    where: { id: { in: typeIds }, isActive: true },
    select: { id: true },
  });
  if (types.length !== typeIds.length) {
    return fail("DEFECT_TYPE_INVALID", "不良種類が不正です");
  }

  await prisma.defectRecord.createMany({
    data: defects.map((d) => ({
      workOrderStepId: stepId,
      defectTypeId: d.defectTypeId,
      description: d.description.trim(),
      recordedBy: actorId,
    })),
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(step.workOrder.workOrderNumber),
    after: { note: `不良記録を追加（${defects.length} 件）` },
  });
  return { ok: true };
}
