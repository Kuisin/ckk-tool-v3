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
import {
  type FinalInspectionView,
  getFinalInspection,
} from "./final-inspection";
import type { LocalizedText } from "./format";
import { localized } from "./format";
import type { Locale } from "./i18n";
import {
  type ApprovableInspectionRecord,
  getWorkOrderInspectionRecords,
} from "./inspection-approval";
import {
  entriesBlockingSave,
  type InspectionItemSpec,
  type InspectionSampleValue,
  isSampleEmpty,
  itemSpecFromRow,
  resolveItemPass,
  samplingSpecFromRow,
} from "./inspection-core";
import { inspectionValueLabel } from "./inspection-value-label";
import { encodeInventoryNote } from "./inventory-note-core";
import type { StepActionResult, StepErrorCode } from "./step-execution";
import { inspectionOutcome } from "./steps-core";

const fail = (code: StepErrorCode, ...errors: string[]): StepActionResult => ({
  ok: false,
  codes: [code],
  errors: errors.length > 0 ? errors : undefined,
});

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
  /**
   * VALUES のサンプル呼称（製品1,2,3… / 初品・中間品・最終品）。
   * ページ見出しがこれで決まる — 呼称を無視すると、紙の検査表が「初品」と
   * 呼んでいる 1 枚目が画面では「製品 1」になり、突き合わせられない。
   */
  sampleNaming: "GENERIC" | "INITIAL_MID_FINAL";
  items: InspectionTemplateItemView[];
}

export interface InspectionRecordView {
  id: string;
  /** どの検査表の記録か（完了の門が割当と突き合わせるのに使う）。 */
  templateId: number;
  templateName: string;
  status: string;
  recordedAt: string | null;
  recordedByName: string | null;
  /** 検査表確認（旧帳票の確認欄 — 記録者・承認者とは別ロール）。 */
  confirmedAt: string | null;
  confirmedByName: string | null;
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
  /** 検査承認工程か（カタログ is_approval_step）。 */
  isApprovalStep: boolean;
  /**
   * 承認対象の検査記録（**指示書全体**）。検査承認工程にだけ渡る。
   * 承認は「この指示書の検査がひととおり終わったか」を見る仕事なので、
   * 自分の工程の記録だけでは足りない。
   */
  approvableRecords: ApprovableInspectionRecord[];
  /** 最終検査工程か（カタログ is_final_inspection）。 */
  isFinalInspection: boolean;
  /**
   * 最終検査・出荷前確認（指示書 1 件に 1 行）。
   * 最終検査工程にだけ渡る — 他の工程では null。
   */
  finalInspection: FinalInspectionView | null;
  /** この工程に割り当てられた検査表テンプレート（工程単位の割当）。 */
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
  /** 承認できるかどうかは人によって違うので、閲覧者を受け取る。 */
  actorId: string,
  locale: Locale,
): Promise<StepRecordingData | null> {
  const step = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    select: {
      workOrderId: true,
      processStepId: true,
      processStep: {
        select: {
          isInspection: true,
          isFinalInspection: true,
          isApprovalStep: true,
        },
      },
    },
  });
  if (!step) return null;

  const [
    templateLinks,
    records,
    finalInspection,
    approvableRecords,
    defectTypes,
    defects,
  ] = await Promise.all([
    prisma.workOrderStepInspectionTemplate.findMany({
      where: { stepId },
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
    step.processStep.isFinalInspection
      ? getFinalInspection(step.workOrderId)
      : Promise.resolve(null),
    step.processStep.isApprovalStep
      ? getWorkOrderInspectionRecords(stepId, actorId, locale)
      : Promise.resolve([]),
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
        ...records.map((r) => r.confirmedBy),
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

  // 実測値の表示は検査承認側と同じものを使う（承認する人が見る値と記録した
  // 人が見る値が違ったら承認の意味がない — inspection-value-label.ts）。
  const valueLabel = inspectionValueLabel(locale);

  return {
    isInspection: step.processStep.isInspection,
    isApprovalStep: step.processStep.isApprovalStep,
    approvableRecords,
    isFinalInspection: step.processStep.isFinalInspection,
    finalInspection,
    // この工程に割り当てられたテンプレート（工程単位 — web 側と同じ規則）
    templates: templateLinks.map((t) => ({
      id: t.inspectionTemplate.id,
      code: t.inspectionTemplate.code,
      version: t.inspectionTemplate.version,
      name: localized(asText(t.inspectionTemplate.name), locale),
      sampleNaming: t.inspectionTemplate.sampleNaming,
      ...samplingSpecFromRow(t.inspectionTemplate),
      items: t.inspectionTemplate.items.map((it) => ({
        name: localized(asText(it.itemName), locale),
        ...itemSpecFromRow(it),
      })),
    })),
    inspectionRecords: records.map((r) => ({
      id: r.id,
      templateId: r.templateId,
      templateName: localized(asText(r.template.name), locale),
      status: r.status,
      recordedAt: r.recordedAt?.toISOString() ?? null,
      recordedByName: nameOf(r.recordedBy),
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      confirmedByName: nameOf(r.confirmedBy),
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
  if (!step) return { error: fail("NOT_FOUND", "工程が見つかりません") }; // i18n-ignore
  if (step.status !== "IN_PROGRESS") {
    return {
      error: fail("NOT_IN_PROGRESS", "進行中の工程でのみ記録できます"), // i18n-ignore
    };
  }
  if (step.sessionLockedBy && step.sessionLockedBy !== actorId) {
    return {
      error: fail("LOCK_HELD_BY_OTHER", "別のユーザーがセッション中です"), // i18n-ignore
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
    return fail("ITEMS_REQUIRED", "検査項目がありません"); // i18n-ignore
  }
  const found = await findRecordableStep(stepId, actorId);
  if (found.error) return found.error;
  const step = found.step;

  // テンプレートがこの工程に割り当てられているか + 項目 id・サンプル値が妥当か
  const link = await prisma.workOrderStepInspectionTemplate.findUnique({
    where: {
      stepId_inspectionTemplateId: {
        stepId,
        inspectionTemplateId: templateId,
      },
    },
    include: { inspectionTemplate: { include: { items: true } } },
  });
  if (!link) {
    return fail("TEMPLATE_INVALID", "この工程の検査表ではありません"); // i18n-ignore
  }
  // 記録方式・検査対象はシート（テンプレート）単位
  const style = link.inspectionTemplate.recordStyle;
  const specs = new Map(
    link.inspectionTemplate.items.map((it) => [it.id, itemSpecFromRow(it)]),
  );
  for (const i of items) {
    const spec = specs.get(i.templateItemId);
    if (!spec) {
      return fail("TEMPLATE_INVALID", "検査項目がテンプレートと一致しません"); // i18n-ignore
    }
    const optionValues = new Set(spec.options.map((o) => o.value));
    for (const s of i.values) {
      const values = Array.isArray(s) ? s : [s];
      if (
        (spec.inputType === "SELECT_SINGLE" ||
          spec.inputType === "SELECT_MULTI") &&
        !values.every((x) => x === "" || optionValues.has(x))
      ) {
        return fail("TEMPLATE_INVALID", "選択肢にない値が含まれています"); // i18n-ignore
      }
      if (
        spec.inputType === "BOOLEAN" &&
        !values.every((x) => x === "" || x === "true" || x === "false")
      ) {
        return fail("TEMPLATE_INVALID", "真偽項目の値が不正です"); // i18n-ignore
      }
    }
    if (
      style === "COUNTS" &&
      i.inspectedCount != null &&
      i.passedCount != null &&
      i.passedCount > i.inspectedCount
    ) {
      return fail("ITEMS_REQUIRED", "合格数が検査数を超えています"); // i18n-ignore
    }
  }
  // 必須 + 手動上書き不可の項目は入力が無いと保存できない — フォームと同じ
  // 規則（inspection-core.entriesBlockingSave）をサーバーでも通す。テンプレート
  // の項目を基準に見るので、項目ごと送られてこなくてもすり抜けない。
  const entryByItem = new Map(
    items.map((i) => [
      i.templateItemId,
      {
        samples: i.values,
        inspectedCount: style === "COUNTS" ? i.inspectedCount : null,
        passedCount: style === "COUNTS" ? i.passedCount : null,
      },
    ]),
  );
  const blocking = entriesBlockingSave(
    link.inspectionTemplate.items,
    (id) => entryByItem.get(id),
    style,
  );
  if (blocking.length > 0) {
    return fail("ITEMS_REQUIRED", "必須項目の実測値を入力してください"); // i18n-ignore
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
      note: encodeInventoryNote(
        status === "PASS" ? "inspectionRecordedPass" : "inspectionRecordedFail",
        { count: items.length },
      ),
    },
  });
  return { ok: true };
}

/**
 * 検査表確認 — 旧帳票の「検査表確認」欄。記録者（recordedBy）とも承認者
 * （approvedBy = 検査承認工程）とも別ロールのスタンプで、合否に関わらず押せる
 * （第三者が記入内容を確認したという記録であって、承認そのものではない）。
 * **承認（APPROVED への遷移）はキオスクに持たない** — web の管理画面のみ。
 */
export async function confirmInspectionRecord(
  stepId: string,
  actorId: string,
  recordId: string,
): Promise<StepActionResult> {
  const found = await findRecordableStep(stepId, actorId);
  if (found.error) return found.error;
  const step = found.step;

  // この工程の記録だけ — 他の工程の記録に別画面から印は押させない。
  const record = await prisma.inspectionRecord.findFirst({
    where: { id: recordId, workOrderStepId: stepId },
    select: { id: true },
  });
  if (!record) return fail("NOT_FOUND", "検査記録が見つかりません"); // i18n-ignore

  await prisma.inspectionRecord.update({
    where: { id: recordId },
    data: { confirmedBy: actorId, confirmedAt: new Date() },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(step.workOrder.workOrderNumber),
    after: { note: encodeInventoryNote("inspectionConfirmed") },
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
    return fail("ITEMS_REQUIRED", "不良記録がありません"); // i18n-ignore
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
    return fail("DEFECT_TYPE_INVALID", "不良種類が不正です"); // i18n-ignore
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
    after: {
      note: encodeInventoryNote("defectsRecorded", { count: defects.length }),
    },
  });
  return { ok: true };
}
