/**
 * step-records.ts — 工程の検査記録・不良記録（読み取り + 書き込み）。server-only.
 *
 * PR #272 で意図的に nextjs-web 側へ残していた 2 機能のキオスク版。
 * nextjs-web の saveInspectionRecord / saveDefectRecords（work-orders/[id]/steps/
 * [stepId]/actions.ts）と同じ業務規則で書く:
 * - 検査記録: 進行中（IN_PROGRESS）の工程のみ。全項目合格 = PASS / 1 つでも
 *   不合格 = FAIL。テンプレートは指示書に紐付くもの（work_order_inspection_
 *   templates）のみ受け付ける。
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
import type { StepActionResult, StepErrorCode } from "./step-execution";
import { inspectionOutcome } from "./steps-core";

const fail = (code: StepErrorCode, ...errors: string[]): StepActionResult => ({
  ok: false,
  codes: [code],
  errors: errors.length > 0 ? errors : undefined,
});

// ── 読み取り（実行画面に出すデータ） ─────────────────────────────────────────

export interface InspectionTemplateItemView {
  id: number;
  name: string;
  unit: string | null;
  toleranceMin: number | null;
  toleranceMax: number | null;
  isRequired: boolean;
}

export interface InspectionTemplateView {
  id: number;
  code: string;
  name: string;
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
    measuredValue: string | null;
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
  /** 指示書に紐付く検査表テンプレート。 */
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
        items: {
          include: { templateItem: { select: { itemName: true } } },
        },
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

  return {
    isInspection: step.processStep.isInspection,
    templates: templateLinks.map((t) => ({
      id: t.inspectionTemplate.id,
      code: t.inspectionTemplate.code,
      name: localized(asText(t.inspectionTemplate.name), locale),
      items: t.inspectionTemplate.items.map((it) => ({
        id: it.id,
        name: localized(asText(it.itemName), locale),
        unit: it.unit,
        // Decimal → Number（境界で変換）
        toleranceMin: it.toleranceMin == null ? null : Number(it.toleranceMin),
        toleranceMax: it.toleranceMax == null ? null : Number(it.toleranceMax),
        isRequired: it.isRequired,
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
        measuredValue: it.measuredValue,
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
  measuredValue: string;
  isPass: boolean;
}

/**
 * 検査記録の保存 — 全項目合格なら PASS、1 つでも不合格なら FAIL。
 * テンプレートは指示書に紐付くもののみ・項目はそのテンプレートの全項目。
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

  // テンプレートが指示書に紐付いているか + 項目 id がテンプレートのものか
  const link = await prisma.workOrderInspectionTemplate.findUnique({
    where: {
      workOrderId_inspectionTemplateId: {
        workOrderId: step.workOrderId,
        inspectionTemplateId: templateId,
      },
    },
    include: {
      inspectionTemplate: { include: { items: { select: { id: true } } } },
    },
  });
  if (!link) {
    return fail("TEMPLATE_INVALID", "この指示書の検査表ではありません");
  }
  const validItemIds = new Set(link.inspectionTemplate.items.map((i) => i.id));
  if (!items.every((i) => validItemIds.has(i.templateItemId))) {
    return fail("TEMPLATE_INVALID", "検査項目がテンプレートと一致しません");
  }

  const status = inspectionOutcome(items);
  await prisma.inspectionRecord.create({
    data: {
      workOrderStepId: stepId,
      templateId,
      status,
      recordedBy: actorId,
      recordedAt: new Date(),
      items: {
        create: items.map((i) => ({
          templateItemId: i.templateItemId,
          measuredValue: i.measuredValue.trim() || null,
          isPass: i.isPass,
        })),
      },
    },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(step.workOrder.workOrderNumber),
    after: {
      note: `検査記録を保存（${status === "PASS" ? "合格" : "不合格"} / ${items.length} 項目）（キオスク）`,
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
    after: { note: `不良記録を追加（${defects.length} 件）（キオスク）` },
  });
  return { ok: true };
}
