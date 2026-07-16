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
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission, type PermissionAction } from "@/lib/authz";
import { prisma } from "@/lib/db";
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

/** 工程完了（数量整合はサーバー側でも検証される）。 */
export async function completeStep(
  workOrderNumber: number,
  stepId: string,
  quantities: z.infer<typeof quantitiesInput>,
): Promise<StepActionResult> {
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = quantitiesInput.safeParse(quantities);
  if (!parsed.success) return { ok: false, errors: ["数量の入力が不正です"] };
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) return { ok: false, errors: ["工程が見つかりません"] };
    const result = await completeStepExecution(stepId, parsed.data);
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

const inspectionInput = z.object({
  workOrderNumber: z.number().int().positive(),
  stepId: z.string().min(1),
  templateId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        templateItemId: z.number().int().positive(),
        measuredValue: z.string(),
        isPass: z.boolean(),
      }),
    )
    .min(1, "検査項目がありません"),
});

export type InspectionInput = z.infer<typeof inspectionInput>;

/** 検査記録の保存 — 全項目合格なら PASS、1 つでも不合格なら FAIL。 */
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
            measuredValue: i.measuredValue.trim() || null,
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
    await prisma.workOrderStep.update({
      where: { id: v.stepId },
      data: {
        outsourceRequestedAt: toDate(v.requestedAt),
        outsourceExpectedAt: toDate(v.expectedAt),
        outsourceReceivedAt: toDate(v.receivedAt),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: {
        note: `外注日程を更新（依頼 ${v.requestedAt ?? "—"} / 入荷予定 ${v.expectedAt ?? "—"} / 入荷 ${v.receivedAt ?? "—"}）`,
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, "外注日程の保存に失敗しました");
  }
}
