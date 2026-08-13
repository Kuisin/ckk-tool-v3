"use server";

/**
 * Server Actions — 工程実行 (§7 / design.md §12.3)。
 *
 * lib/workflow.ts の実行系関数（server 関数だが server action ではない）を
 * "use server" でラップし、revalidatePath を併せて行う。検査記録・不良記録・
 * 外注日程の永続化アクションもここに置く（監査は work_orders /
 * recordId = String(workOrderNumber) に記録 — 指示書詳細の履歴タブに載せる）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toItemSpec } from "@/app/(dashboard)/master/inspection-templates/data";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission, type PermissionAction } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { isSampleEmpty } from "@/lib/inspection-core";
import {
  abortStepExecution,
  addBranchSeries,
  completeStepExecution,
  rollbackStepExecution,
  type StepActionResult,
  startStepExecution,
} from "@/lib/workflow";

const BASE_PATH = "/production/work-orders";

function revalidate(workOrderNumber: number, stepId?: string) {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${workOrderNumber}`);
  revalidatePath(`/production/approvals/${workOrderNumber}`);
  if (stepId) {
    revalidatePath(`${BASE_PATH}/${workOrderNumber}/steps/${stepId}`);
  }
}

function failed(e: unknown, fallback: string): StepActionResult {
  console.error(fallback, e);
  return { ok: false, errors: [fallback] };
}

/** RBAC ゲート — 拒否時は StepActionResult 形のエラー、許可時は null。 */
async function deniedStepPermission(
  action: PermissionAction,
): Promise<StepActionResult | null> {
  const authz = await checkPermission("work_order", action);
  return authz.ok ? null : { ok: false, errors: [authz.error] };
}

/** 工程が指示書に属することの検証（URL 直叩き対策）。 */
async function findStep(workOrderNumber: number, stepId: string) {
  return prisma.workOrderStep.findFirst({
    where: { id: stepId, workOrder: { workOrderNumber } },
    include: { workOrder: { select: { id: true, workOrderNumber: true } } },
  });
}

// ── 実行系ラッパ ─────────────────────────────────────────────────────────────

/** 工程開始（PENDING → IN_PROGRESS、セッションロック取得）。 */
export async function startStep(
  workOrderNumber: number,
  stepId: string,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    const result = await startStepExecution(stepId);
    if (result.ok) revalidate(workOrderNumber, stepId);
    return result;
  } catch (e) {
    return failed(e, "工程の開始に失敗しました");
  }
}

const quantitiesInput = z.object({
  inputQuantity: z.number().int(),
  outputSuccessQuantity: z.number().int(),
  outputDefectSemiFinished: z.number().int(),
  outputDefectScrap: z.number().int(),
  outputDefectRework: z.number().int(),
});

const defectReasonsInput = z
  .array(
    z.object({
      type: z.enum(["SEMI", "SCRAP", "REWORK"]),
      reason: z.string().trim().max(100),
      count: z.number().int().min(1).max(1_000_000),
    }),
  )
  .max(100);

/**
 * 工程完了（数量整合はサーバー側でも検証される）。
 * 数量管理なし（NONE）の工程は quantities = null で呼ぶ — サーバーが
 * 受入数をそのまま良品数へパススルー保存する。不良は {種別, 理由, 数} の
 * リスト（defectReasons）で渡し、サーバーが区分合計を再計算する。
 */
export async function completeStep(
  workOrderNumber: number,
  stepId: string,
  quantities: z.infer<typeof quantitiesInput> | null,
  defectReasons?: z.infer<typeof defectReasonsInput>,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = quantitiesInput.nullable().safeParse(quantities);
  if (!parsed.success) return { ok: false, errors: ["数量の入力が不正です"] };
  const parsedReasons = defectReasonsInput.optional().safeParse(defectReasons);
  if (!parsedReasons.success) {
    return { ok: false, errors: ["不良の入力が不正です"] };
  }
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    const result = await completeStepExecution(
      stepId,
      parsed.data,
      parsedReasons.data ?? null,
    );
    if (result.ok) revalidate(workOrderNumber, stepId);
    return result;
  } catch (e) {
    return failed(e, "工程の完了に失敗しました");
  }
}

/** 進行中の中断（IN_PROGRESS → PENDING）。 */
export async function abortStep(
  workOrderNumber: number,
  stepId: string,
  reason: string,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  if (!reason.trim()) {
    return { ok: false, errors: ["中断理由を入力してください"] };
  }
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    const result = await abortStepExecution(stepId, reason.trim());
    if (result.ok) revalidate(workOrderNumber, stepId);
    return result;
  } catch (e) {
    return failed(e, "工程の中断に失敗しました");
  }
}

/** 完了済みの巻き戻し（COMPLETED → PENDING、後続着手済みなら不可）。 */
export async function rollbackStep(
  workOrderNumber: number,
  stepId: string,
  reason: string,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    const result = await rollbackStepExecution(stepId, reason);
    if (result.ok) revalidate(workOrderNumber, stepId);
    return result;
  } catch (e) {
    return failed(e, "工程の巻き戻しに失敗しました");
  }
}

// ── 分岐追加（指示書詳細の分岐追加モーダルから） ─────────────────────────────

const addBranchInput = z.object({
  workOrderNumber: z.number().int().positive(),
  sourceStepId: z.string().min(1),
  catalogStepIds: z
    .array(z.number().int().positive())
    .min(1, "追加する工程を選択してください"),
  routedQuantity: z
    .number()
    .int()
    .min(1, "分岐数量は 1 以上で入力してください"),
  mergeTargetStepId: z.string().nullable(),
});

export type AddBranchInput = z.infer<typeof addBranchInput>;

/** 分岐系列の追加（手直し・半製品再投入）。 */
export async function addBranch(
  payload: AddBranchInput,
): Promise<StepActionResult> {
  // 既存指示書のワークフロー変更 — CREATE ではなく UPDATE（判断メモ）。
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = addBranchInput.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? "入力が不正です"],
    };
  }
  const v = parsed.data;
  try {
    const wo = await prisma.workOrder.findUnique({
      where: { workOrderNumber: v.workOrderNumber },
      select: { id: true },
    });
    if (!wo) return { ok: false, errors: ["指示書が見つかりません"] };
    const result = await addBranchSeries({
      workOrderId: wo.id,
      sourceStepId: v.sourceStepId,
      catalogStepIds: v.catalogStepIds,
      routedQuantity: v.routedQuantity,
      mergeTargetStepId: v.mergeTargetStepId,
    });
    if (result.ok) revalidate(v.workOrderNumber);
    return result;
  } catch (e) {
    return failed(e, "分岐の追加に失敗しました");
  }
}

// ── 検査記録 (§7 / design.md §12.5) ─────────────────────────────────────────

// サンプル値: SELECT_MULTI は value[]、それ以外は文字列（inspection-core と同形）
const sampleValue = z.union([z.string(), z.array(z.string())]);

const inspectionInput = z.object({
  workOrderNumber: z.number().int().positive(),
  stepId: z.string().min(1),
  templateId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        templateItemId: z.number().int().positive(),
        values: z.array(sampleValue),
        isPass: z.boolean(),
      }),
    )
    .min(1, "検査項目がありません"),
});

export type InspectionInput = z.infer<typeof inspectionInput>;

/**
 * 検査記録の保存 — 全項目合格なら PASS、1 つでも不合格なら FAIL。
 * テンプレートは指示書に紐付くもののみ・項目 id はテンプレートと一致必須。
 * サンプル値は型検証（選択肢の membership）し、合否は自動判定を検証しつつ
 * クライアントの値（手動上書き可）を保存する。キオスク側
 * （nextjs-kiosk step-records.ts recordInspection）と同一規則。
 */
export async function saveInspectionRecord(
  payload: InspectionInput,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = inspectionInput.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? "入力が不正です"],
    };
  }
  const v = parsed.data;
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    if (step.status !== "IN_PROGRESS") {
      return { ok: false, errors: ["進行中の工程でのみ記録できます"] };
    }
    // テンプレートが指示書に紐付いているか + 項目 id・サンプル値が妥当か
    const link = await prisma.workOrderInspectionTemplate.findUnique({
      where: {
        workOrderId_inspectionTemplateId: {
          workOrderId: step.workOrder.id,
          inspectionTemplateId: v.templateId,
        },
      },
      include: { inspectionTemplate: { include: { items: true } } },
    });
    if (!link) {
      return { ok: false, errors: ["この指示書の検査表ではありません"] };
    }
    const templateItems = new Map(
      link.inspectionTemplate.items.map((it) => [it.id, toItemSpec(it)]),
    );
    for (const i of v.items) {
      const spec = templateItems.get(i.templateItemId);
      if (!spec) {
        return {
          ok: false,
          errors: ["検査項目がテンプレートと一致しません"],
        };
      }
      const optionValues = new Set(spec.options.map((o) => o.value));
      for (const s of i.values) {
        const values = Array.isArray(s) ? s : [s];
        if (
          (spec.inputType === "SELECT_SINGLE" ||
            spec.inputType === "SELECT_MULTI") &&
          !values.every((x) => x === "" || optionValues.has(x))
        ) {
          return { ok: false, errors: ["選択肢にない値が含まれています"] };
        }
        if (
          spec.inputType === "BOOLEAN" &&
          !values.every((x) => x === "" || x === "true" || x === "false")
        ) {
          return { ok: false, errors: ["真偽項目の値が不正です"] };
        }
      }
    }
    const actor = await getCurrentActorId();
    const status = v.items.every((i) => i.isPass) ? "PASS" : "FAIL";
    await prisma.inspectionRecord.create({
      data: {
        workOrderStepId: v.stepId,
        templateId: v.templateId,
        status,
        recordedBy: actor,
        recordedAt: new Date(),
        items: {
          create: v.items.map((i) => ({
            templateItemId: i.templateItemId,
            measuredValues: i.values.filter((s) => !isSampleEmpty(s)),
            isPass: i.isPass,
          })),
        },
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: {
        note: `検査記録を保存（${status === "PASS" ? "合格" : "不合格"} / ${v.items.length} 項目）`,
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, "検査記録の保存に失敗しました");
  }
}

/** 検査記録の承認（承認工程、PASS → APPROVED）。 */
export async function approveInspectionRecord(
  workOrderNumber: number,
  stepId: string,
  recordId: string,
): Promise<StepActionResult> {
  // 検査承認 — approve* の規約に従い ACTION=APPROVE（コードは工程実行の
  // 文脈なので "work_order" のまま。承認グループとは別系統 — 判断メモ）。
  const denied = await deniedStepPermission("APPROVE");
  if (denied) return denied;
  try {
    const record = await prisma.inspectionRecord.findFirst({
      where: { id: recordId, step: { workOrder: { workOrderNumber } } },
    });
    if (!record) return { ok: false, errors: ["検査記録が見つかりません"] };
    if (record.status !== "PASS") {
      return { ok: false, errors: ["合格の検査記録のみ承認できます"] };
    }
    const actor = await getCurrentActorId();
    await prisma.inspectionRecord.update({
      where: { id: recordId },
      data: { status: "APPROVED", approvedBy: actor, approvedAt: new Date() },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: { note: "検査記録を承認" },
    });
    revalidate(workOrderNumber, stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, "検査記録の承認に失敗しました");
  }
}

// ── 不良記録 (§7 / design.md §12.6) ─────────────────────────────────────────

const defectsInput = z.object({
  workOrderNumber: z.number().int().positive(),
  stepId: z.string().min(1),
  records: z
    .array(
      z.object({
        defectTypeId: z.number().int().positive("不良種類を選択してください"),
        description: z.string().min(1, "不良内容を入力してください"),
      }),
    )
    .min(1, "不良記録がありません"),
});

export type DefectsInput = z.infer<typeof defectsInput>;

/** 不良記録の保存（複数行まとめて追加）。 */
export async function saveDefectRecords(
  payload: DefectsInput,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = defectsInput.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? "入力が不正です"],
    };
  }
  const v = parsed.data;
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    const actor = await getCurrentActorId();
    await prisma.defectRecord.createMany({
      data: v.records.map((r) => ({
        workOrderStepId: v.stepId,
        defectTypeId: r.defectTypeId,
        description: r.description.trim(),
        recordedBy: actor,
      })),
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: { note: `不良記録を追加（${v.records.length} 件）` },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, "不良記録の保存に失敗しました");
  }
}

// ── 外注日程 ─────────────────────────────────────────────────────────────────

const outsourceDatesInput = z.object({
  workOrderNumber: z.number().int().positive(),
  stepId: z.string().min(1),
  requestedAt: z.string().nullable(), // YYYY-MM-DD
  expectedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  // 外注コスト（円・任意 — 監査 P2-6）
  outsourceCost: z.number().nonnegative().nullable().optional(),
});

export type OutsourceDatesInput = z.infer<typeof outsourceDatesInput>;

/** 外注工程の 依頼日 / 入荷予定日 / 入荷日 の保存。 */
export async function saveOutsourceDates(
  payload: OutsourceDatesInput,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = outsourceDatesInput.safeParse(payload);
  if (!parsed.success) return { ok: false, errors: ["入力が不正です"] };
  const v = parsed.data;
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    if (step.executionLocation !== "OUTSOURCE") {
      return { ok: false, errors: ["外注工程ではありません"] };
    }
    const toDate = (s: string | null) => (s ? new Date(s) : null);
    const wasReceived = step.outsourceReceivedAt != null;
    await prisma.workOrderStep.update({
      where: { id: v.stepId },
      data: {
        outsourceRequestedAt: toDate(v.requestedAt),
        outsourceExpectedAt: toDate(v.expectedAt),
        outsourceReceivedAt: toDate(v.receivedAt),
        ...(v.outsourceCost !== undefined
          ? { outsourceCost: v.outsourceCost }
          : {}),
      },
    });
    // 外注入荷のハンドオフ通知（null → 入荷日設定の遷移時のみ・best-effort）
    if (!wasReceived && v.receivedAt) {
      try {
        const wo = await prisma.workOrder.findUnique({
          where: { workOrderNumber: v.workOrderNumber },
          select: { id: true, createdBy: true },
        });
        if (wo?.createdBy) {
          const { notify } = await import("@/lib/notifications");
          await notify({
            userIds: [wo.createdBy],
            type: "SYSTEM",
            title: `指示書 #${v.workOrderNumber} の外注工程が入荷しました`,
            linkPath: `/production/work-orders/${wo.id}`,
          });
        }
      } catch (e) {
        console.error("[outsource] 入荷通知に失敗:", e);
      }
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: {
        note: `外注日程を更新（依頼 ${v.requestedAt ?? "—"} / 入荷予定 ${v.expectedAt ?? "—"} / 入荷 ${v.receivedAt ?? "—"}${v.outsourceCost != null ? ` / 外注費 ¥${v.outsourceCost.toLocaleString()}` : ""}）`,
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, "外注日程の保存に失敗しました");
  }
}

// ── 作業計画 / 実績 (§7 — 分割記録・担当者・日付/時刻) ──────────────────────

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const planActualBase = {
  workOrderNumber: z.number().int().positive(),
  stepId: z.string().min(1),
  userId: z.string().min(1, "担当者を選択してください"),
  date: z.string().regex(datePattern, "日付を選択してください"),
  startTime: z
    .string()
    .regex(timePattern, "時刻は HH:mm 形式で入力してください")
    .nullable(),
  endTime: z
    .string()
    .regex(timePattern, "時刻は HH:mm 形式で入力してください")
    .nullable(),
  quantity: z.number().int().min(1).nullable(),
  notes: z.string(),
};

const stepPlanInput = z.object(planActualBase);
const stepActualInput = z.object(planActualBase);

export type StepPlanInput = z.infer<typeof stepPlanInput>;
export type StepActualInput = z.infer<typeof stepActualInput>;

/** "YYYY-MM-DD" + "HH:mm"（JST）→ timestamptz。time が null なら null。 */
function toJstTimestamp(date: string, time: string | null): Date | null {
  if (!time) return null;
  return new Date(`${date}T${time}:00+09:00`);
}

function validateTimeRange(v: {
  startTime: string | null;
  endTime: string | null;
}): string | null {
  if (v.startTime && v.endTime && v.startTime >= v.endTime) {
    return "終了時刻は開始時刻より後にしてください";
  }
  return null;
}

/** 作業計画の追加 — 未完了（PENDING / IN_PROGRESS）の工程のみ。 */
export async function addStepPlan(
  payload: StepPlanInput,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = stepPlanInput.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? "入力が不正です"],
    };
  }
  const v = parsed.data;
  const rangeError = validateTimeRange(v);
  if (rangeError) return { ok: false, errors: [rangeError] };
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    if (step.status === "COMPLETED" || step.status === "CANCELLED") {
      return {
        ok: false,
        errors: ["完了・キャンセル済みの工程には計画を追加できません"],
      };
    }
    const actor = await getCurrentActorId();
    await prisma.workOrderStepPlan.create({
      data: {
        stepId: v.stepId,
        userId: v.userId,
        plannedDate: new Date(`${v.date}T00:00:00+09:00`),
        plannedStartAt: toJstTimestamp(v.date, v.startTime),
        plannedEndAt: toJstTimestamp(v.date, v.endTime),
        quantity: v.quantity,
        notes: v.notes.trim() || null,
        createdBy: actor,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: {
        note: `工程の作業計画を追加（${v.date}${v.startTime ? ` ${v.startTime}〜${v.endTime ?? ""}` : ""}${v.quantity != null ? ` / ${v.quantity}` : ""}）`,
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, "作業計画の追加に失敗しました");
  }
}

/** 作業計画の削除。 */
export async function deleteStepPlan(
  workOrderNumber: number,
  stepId: string,
  planId: string,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    const deleted = await prisma.workOrderStepPlan.deleteMany({
      where: { id: planId, stepId },
    });
    if (deleted.count === 0) {
      return { ok: false, errors: ["対象の計画が見つかりません"] };
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: { note: "工程の作業計画を削除" },
    });
    revalidate(workOrderNumber, stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, "作業計画の削除に失敗しました");
  }
}

/** 作業実績の追加 — 進行中（IN_PROGRESS）の工程のみ。 */
export async function addStepActual(
  payload: StepActualInput,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = stepActualInput.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? "入力が不正です"],
    };
  }
  const v = parsed.data;
  const rangeError = validateTimeRange(v);
  if (rangeError) return { ok: false, errors: [rangeError] };
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    if (step.status !== "IN_PROGRESS") {
      return { ok: false, errors: ["進行中の工程のみ実績を記録できます"] };
    }
    const actor = await getCurrentActorId();
    await prisma.workOrderStepActual.create({
      data: {
        stepId: v.stepId,
        userId: v.userId,
        workedDate: new Date(`${v.date}T00:00:00+09:00`),
        startedAt: toJstTimestamp(v.date, v.startTime),
        endedAt: toJstTimestamp(v.date, v.endTime),
        quantity: v.quantity,
        notes: v.notes.trim() || null,
        createdBy: actor,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: {
        note: `工程の作業実績を追加（${v.date}${v.startTime ? ` ${v.startTime}〜${v.endTime ?? ""}` : ""}${v.quantity != null ? ` / ${v.quantity}` : ""}）`,
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, "作業実績の追加に失敗しました");
  }
}

/** 作業実績の削除 — 工程が完了する前まで。 */
export async function deleteStepActual(
  workOrderNumber: number,
  stepId: string,
  actualId: string,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    if (step.status === "COMPLETED" || step.status === "CANCELLED") {
      return {
        ok: false,
        errors: ["完了・キャンセル済みの工程の実績は削除できません"],
      };
    }
    const deleted = await prisma.workOrderStepActual.deleteMany({
      where: { id: actualId, stepId },
    });
    if (deleted.count === 0) {
      return { ok: false, errors: ["対象の実績が見つかりません"] };
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: { note: "工程の作業実績を削除" },
    });
    revalidate(workOrderNumber, stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, "作業実績の削除に失敗しました");
  }
}
