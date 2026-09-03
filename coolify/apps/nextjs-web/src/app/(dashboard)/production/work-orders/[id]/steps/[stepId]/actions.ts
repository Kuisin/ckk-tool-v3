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
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { resolveApprover } from "@/lib/approvals";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission, type PermissionAction } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  isSampleEmpty,
  itemSpecFromRow,
  resolveItemPass,
} from "@/lib/inspection-core";
import { fetchAllowedWorkLocationIds } from "@/lib/work-locations";
import { submitFlowChange } from "@/lib/work-order-flow-changes";
import {
  abortStepExecution,
  completeStepExecution,
  rollbackStepExecution,
  type StepActionResult,
  startStepExecution,
} from "@/lib/workflow";

const BASE_PATH = "/production/work-orders";

function revalidate(workOrderNumber: number, stepId?: string) {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${workOrderNumber}`);
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
  lotText?: string | null,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsedLot = z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .safeParse(lotText);
  if (!parsedLot.success) {
    return {
      ok: false,
      errors: [tr("production.stepExecutionActions.invalidLotSlipCode")],
    };
  }
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    const result = await startStepExecution(stepId, parsedLot.data ?? null);
    if (result.ok) revalidate(workOrderNumber, stepId);
    return result;
  } catch (e) {
    return failed(e, tr("production.stepExecution.couldNotStartTheStep"));
  }
}

/** 進行中のロット/伝票コード修正（ロック保持者のみ。空文字は削除）。 */
export async function updateStepLot(
  workOrderNumber: number,
  stepId: string,
  lotText: string,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsedLot = z.string().trim().max(100).safeParse(lotText);
  if (!parsedLot.success) {
    return {
      ok: false,
      errors: [tr("production.stepExecutionActions.invalidLotSlipCode")],
    };
  }
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    const actor = await getCurrentActorId();
    const updated = await prisma.workOrderStep.updateMany({
      where: {
        id: stepId,
        status: "IN_PROGRESS",
        OR: [{ sessionLockedBy: null }, { sessionLockedBy: actor }],
      },
      data: { lotText: parsedLot.data || null },
    });
    if (updated.count !== 1) {
      return {
        ok: false,
        errors: [
          tr("production.stepExecutionActions.notInProgressOrLockedByOther"),
        ],
      };
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        note: tr("production.stepExecutionActions.auditLotSlipUpdated"),
        lotText: parsedLot.data,
      },
    });
    revalidate(workOrderNumber, stepId);
    return { ok: true };
  } catch (e) {
    return failed(
      e,
      tr("production.stepExecutionActions.couldNotUpdateLotSlip"),
    );
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
      // 必須化はサーバー業務検証（completeStepExecution）が行う — zod は形だけ。
      defectTypeId: z.number().int().positive().nullable().optional(),
      reason: z.string().trim().max(200),
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
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = quantitiesInput.nullable().safeParse(quantities);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [tr("production.stepExecutionActions.invalidQuantityInput")],
    };
  }
  const parsedReasons = defectReasonsInput.optional().safeParse(defectReasons);
  if (!parsedReasons.success) {
    return {
      ok: false,
      errors: [tr("production.stepExecutionActions.invalidDefectInput")],
    };
  }
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    const result = await completeStepExecution(
      stepId,
      parsed.data,
      parsedReasons.data ?? null,
    );
    if (result.ok) revalidate(workOrderNumber, stepId);
    return result;
  } catch (e) {
    return failed(e, tr("common.couldNotCompleteTheStep"));
  }
}

/** 進行中の中断（IN_PROGRESS → PENDING）。 */
export async function abortStep(
  workOrderNumber: number,
  stepId: string,
  reason: string,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  if (!reason.trim()) {
    return {
      ok: false,
      errors: [tr("production.stepExecutionActions.enterAbortReason")],
    };
  }
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    const result = await abortStepExecution(stepId, reason.trim());
    if (result.ok) revalidate(workOrderNumber, stepId);
    return result;
  } catch (e) {
    return failed(e, tr("production.stepExecutionActions.couldNotAbortStep"));
  }
}

/** 完了済みの巻き戻し（COMPLETED → PENDING、後続着手済みなら不可）。 */
export async function rollbackStep(
  workOrderNumber: number,
  stepId: string,
  reason: string,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    const result = await rollbackStepExecution(stepId, reason);
    if (result.ok) revalidate(workOrderNumber, stepId);
    return result;
  } catch (e) {
    return failed(
      e,
      tr("production.stepExecutionActions.couldNotRollbackStep"),
    );
  }
}

// ── 分岐追加（指示書詳細の分岐追加モーダルから） ─────────────────────────────

/**
 * 分岐の終端（§7 分岐は必ず「合流」か「在庫」で終わる）。
 * 画面はどちらかを選ばないと保存できない — 行き場の無い分岐を作らせない。
 */
const branchTermination = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MERGE"), mergeTargetStepId: z.string().min(1) }),
  z.object({
    kind: z.literal("STOCK"),
    disposition: z.enum(["SEMI_FINISHED", "PRODUCT"]),
  }),
]);

function addBranchInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    workOrderNumber: z.number().int().positive(),
    sourceStepId: z.string().min(1),
    catalogStepIds: z
      .array(z.number().int().positive())
      .min(1, tr("production.stepExecutionActions.selectStepsToAdd")),
    routedQuantity: z
      .number()
      .int()
      .min(1, tr("production.stepExecutionActions.branchQuantityMin")),
    termination: branchTermination,
  });
}

export type AddBranchInput = z.infer<ReturnType<typeof addBranchInputSchema>>;

/** 分岐系列の追加（工程分岐・半製品再投入）。 */
export async function addBranch(
  payload: AddBranchInput,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  // 既存指示書のワークフロー変更 — CREATE ではなく UPDATE（判断メモ）。
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = addBranchInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? tr("common.invalidInput")],
    };
  }
  const v = parsed.data;
  try {
    const wo = await prisma.workOrder.findUnique({
      where: { workOrderNumber: v.workOrderNumber },
      select: { id: true, status: true },
    });
    if (!wo) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.workOrderNotFound")],
      };
    }
    // 承認設定に「工程フロー変更」の段があれば保留 → 最終承認で適用。
    // 1 段も無ければここで即適用（未設定 = 素通し）。
    const result = await submitFlowChange({
      workOrderId: wo.id,
      workOrderNumber: v.workOrderNumber,
      workOrderStatus: wo.status,
      payload: {
        kind: "ADD_BRANCH",
        sourceStepId: v.sourceStepId,
        catalogStepIds: v.catalogStepIds,
        routedQuantity: v.routedQuantity,
        termination: v.termination,
      },
    });
    if (result.ok) revalidate(v.workOrderNumber);
    return result;
  } catch (e) {
    return failed(e, tr("production.addBranchModal.couldNotAddTheBranch"));
  }
}

function updateBranchInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    workOrderNumber: z.number().int().positive(),
    headStepId: z.string().min(1),
    routedQuantity: z
      .number()
      .int()
      .min(1, tr("production.stepExecutionActions.branchQuantityMin"))
      .optional(),
    termination: branchTermination,
  });
}

export type UpdateBranchInput = z.infer<
  ReturnType<typeof updateBranchInputSchema>
>;

/** 分岐系列の更新（分岐数量 / 終端の付け替え）。 */
export async function updateBranch(
  payload: UpdateBranchInput,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = updateBranchInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? tr("common.invalidInput")],
    };
  }
  const v = parsed.data;
  try {
    const wo = await prisma.workOrder.findUnique({
      where: { workOrderNumber: v.workOrderNumber },
      select: { id: true, status: true },
    });
    if (!wo) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.workOrderNotFound")],
      };
    }
    const result = await submitFlowChange({
      workOrderId: wo.id,
      workOrderNumber: v.workOrderNumber,
      workOrderStatus: wo.status,
      payload: {
        kind: "UPDATE_BRANCH",
        headStepId: v.headStepId,
        routedQuantity: v.routedQuantity,
        termination: v.termination,
      },
    });
    if (result.ok) revalidate(v.workOrderNumber);
    return result;
  } catch (e) {
    return failed(e, tr("production.addBranchModal.couldNotUpdateTheBranch"));
  }
}

const removeBranchInput = z.object({
  workOrderNumber: z.number().int().positive(),
  headStepId: z.string().min(1),
});

export type RemoveBranchInput = z.infer<typeof removeBranchInput>;

/** 分岐系列の削除（全工程が未着手 PENDING の間のみ）。 */
export async function removeBranch(
  payload: RemoveBranchInput,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = removeBranchInput.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, errors: [tr("common.invalidInput")] };
  }
  const v = parsed.data;
  try {
    const wo = await prisma.workOrder.findUnique({
      where: { workOrderNumber: v.workOrderNumber },
      select: { id: true, status: true },
    });
    if (!wo) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.workOrderNotFound")],
      };
    }
    const result = await submitFlowChange({
      workOrderId: wo.id,
      workOrderNumber: v.workOrderNumber,
      workOrderStatus: wo.status,
      payload: { kind: "REMOVE_BRANCH", headStepId: v.headStepId },
    });
    if (result.ok) revalidate(v.workOrderNumber);
    return result;
  } catch (e) {
    return failed(
      e,
      tr("production.workOrderStepsPanel.couldNotDeleteTheBranch"),
    );
  }
}

// ── 検査記録 (§7 / design.md §12.5) ─────────────────────────────────────────

// サンプル値: SELECT_MULTI は value[]、それ以外は文字列（inspection-core と同形）
const sampleValue = z.union([z.string(), z.array(z.string())]);

function inspectionInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    workOrderNumber: z.number().int().positive(),
    stepId: z.string().min(1),
    templateId: z.number().int().positive(),
    items: z
      .array(
        z.object({
          templateItemId: z.number().int().positive(),
          values: z.array(sampleValue),
          // 記録方式 COUNTS: 検査数・合格数（VALUES は null）
          inspectedCount: z.number().int().min(0).nullable(),
          passedCount: z.number().int().min(0).nullable(),
          isPass: z.boolean(),
        }),
      )
      .min(1, tr("master.inspectionTemplates.thereAreNoInspectionItems")),
  });
}

export type InspectionInput = z.infer<ReturnType<typeof inspectionInputSchema>>;

/**
 * 検査記録の保存 — 全項目合格なら PASS、1 つでも不合格なら FAIL。
 * テンプレートはこの工程に割り当てられたもののみ・項目 id はテンプレートと一致必須。
 * サンプル値は型検証（選択肢の membership）し、合否は自動判定を検証しつつ
 * クライアントの値（手動上書き可）を保存する。キオスク側
 * （nextjs-kiosk step-records.ts recordInspection）と同一規則。
 */
export async function saveInspectionRecord(
  payload: InspectionInput,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = inspectionInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? tr("common.invalidInput")],
    };
  }
  const v = parsed.data;
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    if (step.status !== "IN_PROGRESS") {
      return {
        ok: false,
        errors: [
          tr("production.stepExecutionActions.onlyRecordableWhileInProgress"),
        ],
      };
    }
    // テンプレートがこの工程に割り当てられているか + 項目 id・サンプル値が妥当か
    const link = await prisma.workOrderStepInspectionTemplate.findUnique({
      where: {
        stepId_inspectionTemplateId: {
          stepId: step.id,
          inspectionTemplateId: v.templateId,
        },
      },
      include: { inspectionTemplate: { include: { items: true } } },
    });
    if (!link) {
      return {
        ok: false,
        errors: [
          tr("production.stepExecutionActions.notThisStepsInspectionSheet"),
        ],
      };
    }
    // 記録方式・検査対象はシート（テンプレート）単位
    const style = link.inspectionTemplate.recordStyle;
    const templateItems = new Map(
      link.inspectionTemplate.items.map((it) => [it.id, itemSpecFromRow(it)]),
    );
    for (const i of v.items) {
      const spec = templateItems.get(i.templateItemId);
      if (!spec) {
        return {
          ok: false,
          errors: [
            tr("production.stepExecutionActions.itemDoesNotMatchTemplate"),
          ],
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
          return {
            ok: false,
            errors: [tr("production.stepExecutionActions.valueNotInOptions")],
          };
        }
        if (
          spec.inputType === "BOOLEAN" &&
          !values.every((x) => x === "" || x === "true" || x === "false")
        ) {
          return {
            ok: false,
            errors: [tr("production.stepExecutionActions.invalidBooleanValue")],
          };
        }
      }
      if (
        style === "COUNTS" &&
        i.inspectedCount != null &&
        i.passedCount != null &&
        i.passedCount > i.inspectedCount
      ) {
        return {
          ok: false,
          errors: [
            tr(
              "production.inspectionRecordForm.passedCountExceedsInspectedCount",
            ),
          ],
        };
      }
    }
    const actor = await getCurrentActorId();
    // 合否はサーバーでも解決 — 上書き不可の項目はクライアント値を無視して
    // 自動判定を強制する（resolveItemPass — フォームと同一規則）。
    // values は位置 = 製品番号なので詰めない（末尾の空のみ削除）。
    const resolved = v.items.map((i) => {
      const spec = templateItems.get(i.templateItemId);
      const isCounts = style === "COUNTS";
      const samples = [...i.values];
      while (samples.length > 0 && isSampleEmpty(samples[samples.length - 1])) {
        samples.pop();
      }
      const entry = {
        samples,
        inspectedCount: isCounts ? i.inspectedCount : null,
        passedCount: isCounts ? i.passedCount : null,
      };
      return {
        templateItemId: i.templateItemId,
        measuredValues: isCounts ? [] : samples,
        inspectedCount: entry.inspectedCount,
        passedCount: entry.passedCount,
        isPass: spec ? resolveItemPass(spec, entry, i.isPass, style) : i.isPass,
      };
    });
    const status = resolved.every((i) => i.isPass) ? "PASS" : "FAIL";
    await prisma.inspectionRecord.create({
      data: {
        workOrderStepId: v.stepId,
        templateId: v.templateId,
        status,
        recordedBy: actor,
        recordedAt: new Date(),
        items: { create: resolved },
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: {
        note: tr("production.stepExecutionActions.auditInspectionSaved", {
          result:
            status === "PASS"
              ? tr("production.inspectionRecordForm.pass")
              : tr("production.inspectionRecordForm.fail"),
          count: v.items.length,
        }),
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(
      e,
      tr("production.inspectionRecordForm.couldNotSaveTheInspectionRecord"),
    );
  }
}

/** 検査記録の承認（承認工程、PASS → APPROVED）。 */
export async function approveInspectionRecord(
  workOrderNumber: number,
  stepId: string,
  recordId: string,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  // 検査承認 — 工程実行と同じ work_order:UPDATE を RBAC の門番として使う
  // （承認アクション（APPROVE）は使わない — こちらの検査承認は工程実行の
  //   一部として扱う）。実ゲートは検査表テンプレートの承認グループ
  //   （承認設定 MS0B の approval_groups）— 設定されていれば、そのグループの
  //   実効メンバー（本人 or 期間内の代理）だけが承認できる。未設定の
  //   テンプレートは従来どおり誰でも承認できる。
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  try {
    const record = await prisma.inspectionRecord.findFirst({
      where: { id: recordId, step: { workOrder: { workOrderNumber } } },
      include: {
        template: {
          select: {
            approvalGroupId: true,
            approvers: { select: { userId: true } },
          },
        },
      },
    });
    if (!record) {
      return {
        ok: false,
        errors: [
          tr("production.stepExecutionActions.inspectionRecordNotFound"),
        ],
      };
    }
    if (record.status !== "PASS") {
      return {
        ok: false,
        errors: [
          tr("production.stepExecutionActions.onlyPassRecordsCanBeApproved"),
        ],
      };
    }
    const actor = await getCurrentActorId();
    if (record.template.approvalGroupId != null) {
      const { ok } = await resolveApprover(
        record.template.approvalGroupId,
        actor,
        null,
      );
      if (!ok) {
        return {
          ok: false,
          errors: [
            tr(
              "production.stepExecutionActions.onlyApprovalGroupMembersCanApprove",
            ),
          ],
        };
      }
    } else if (record.template.approvers.length > 0) {
      const isApprover = record.template.approvers.some(
        (a) => a.userId === actor,
      );
      if (!isApprover) {
        return {
          ok: false,
          errors: [
            tr("production.stepExecutionActions.onlyApproversCanApprove"),
          ],
        };
      }
    }
    await prisma.inspectionRecord.update({
      where: { id: recordId },
      data: { status: "APPROVED", approvedBy: actor, approvedAt: new Date() },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        note: tr("production.stepExecutionActions.auditInspectionApproved"),
      },
    });
    revalidate(workOrderNumber, stepId);
    return { ok: true };
  } catch (e) {
    return failed(
      e,
      tr("production.inspectionRecordForm.couldNotApproveTheInspectionRecord"),
    );
  }
}

/**
 * 検査表確認（旧帳票「検査表確認」欄）— recordedBy（検査者）/ approvedBy
 * （検収印）とは別ロールのスタンプ。合否状態に関わらず押せる（第三者が
 * 記入内容を確認したという記録であって、承認そのものではない）。
 */
export async function confirmInspectionRecord(
  workOrderNumber: number,
  stepId: string,
  recordId: string,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  try {
    const record = await prisma.inspectionRecord.findFirst({
      where: { id: recordId, step: { workOrder: { workOrderNumber } } },
    });
    if (!record) {
      return {
        ok: false,
        errors: [
          tr("production.stepExecutionActions.inspectionRecordNotFound"),
        ],
      };
    }
    const actor = await getCurrentActorId();
    await prisma.inspectionRecord.update({
      where: { id: recordId },
      data: { confirmedBy: actor, confirmedAt: new Date() },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        note: tr("production.stepExecutionActions.auditInspectionConfirmed"),
      },
    });
    revalidate(workOrderNumber, stepId);
    return { ok: true };
  } catch (e) {
    return failed(
      e,
      tr("production.inspectionRecordForm.couldNotRecordTheInspectionSheet"),
    );
  }
}

// ── 不良記録 (§7 / design.md §12.6) ─────────────────────────────────────────

function defectsInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    workOrderNumber: z.number().int().positive(),
    stepId: z.string().min(1),
    records: z
      .array(
        z.object({
          defectTypeId: z
            .number()
            .int()
            .positive(tr("production.stepExecutionActions.selectDefectType")),
          description: z
            .string()
            .min(
              1,
              tr("production.stepExecutionActions.enterDefectDescription"),
            ),
        }),
      )
      .min(1, tr("production.stepExecutionActions.noDefectRecords")),
  });
}

export type DefectsInput = z.infer<ReturnType<typeof defectsInputSchema>>;

/** 不良記録の保存（複数行まとめて追加）。 */
export async function saveDefectRecords(
  payload: DefectsInput,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = defectsInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? tr("common.invalidInput")],
    };
  }
  const v = parsed.data;
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
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
      after: {
        note: tr("production.stepExecutionActions.auditDefectsAdded", {
          count: v.records.length,
        }),
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(
      e,
      tr("production.defectRecordForm.couldNotSaveTheDefectRecord"),
    );
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
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = outsourceDatesInput.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, errors: [tr("common.invalidInput")] };
  }
  const v = parsed.data;
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    if (step.executionLocation !== "OUTSOURCE") {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.notAnOutsourceStep")],
      };
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
            title: tr(
              "production.stepExecutionActions.notifyOutsourceReceived",
              {
                workOrderNumber: v.workOrderNumber,
              },
            ),
            linkPath: `/production/work-orders/${wo.id}`,
          });
        }
      } catch (e) {
        console.error(
          tr("production.stepExecutionActions.outsourceNotifyFailedLog"),
          e,
        );
      }
    }
    const costText =
      v.outsourceCost != null
        ? tr("production.stepExecutionActions.auditOutsourceCostSuffix", {
            amount: v.outsourceCost.toLocaleString(),
          })
        : "";
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: {
        note: tr("production.stepExecutionActions.auditOutsourceUpdated", {
          requested: v.requestedAt ?? "—",
          expected: v.expectedAt ?? "—",
          received: v.receivedAt ?? "—",
          cost: costText,
        }),
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(
      e,
      tr("production.stepExecution.couldNotSaveTheOutsourcingSchedule"),
    );
  }
}

// ── 作業計画 / 実績 (§7 — 分割記録・担当者・日付/時刻) ──────────────────────

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function planActualBaseShape(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return {
    workOrderNumber: z.number().int().positive(),
    stepId: z.string().min(1),
    userId: z
      .string()
      .min(1, tr("production.stepPlanActualPanel.selectAnAssignee")),
    date: z
      .string()
      .regex(datePattern, tr("production.stepPlanActualPanel.selectADate")),
    startTime: z
      .string()
      .regex(
        timePattern,
        tr("production.stepExecutionActions.invalidTimeFormat"),
      )
      .nullable(),
    endTime: z
      .string()
      .regex(
        timePattern,
        tr("production.stepExecutionActions.invalidTimeFormat"),
      )
      .nullable(),
    quantity: z.number().int().min(1).nullable(),
    // 作業場所（機械/エリア — 任意。計画・実績とも）
    workLocationId: z.number().int().positive().nullable(),
    notes: z.string(),
  };
}

function stepPlanInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object(planActualBaseShape(tr));
}
function stepActualInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object(planActualBaseShape(tr));
}

export type StepPlanInput = z.infer<ReturnType<typeof stepPlanInputSchema>>;
export type StepActualInput = z.infer<ReturnType<typeof stepActualInputSchema>>;

/** "YYYY-MM-DD" + "HH:mm"（JST）→ timestamptz。time が null なら null。 */
function toJstTimestamp(date: string, time: string | null): Date | null {
  if (!time) return null;
  return new Date(`${date}T${time}:00+09:00`);
}

function validateTimeRange(
  v: {
    startTime: string | null;
    endTime: string | null;
  },
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  if (v.startTime && v.endTime && v.startTime >= v.endTime) {
    return tr("production.stepExecutionActions.endTimeMustBeAfterStart");
  }
  return null;
}

/**
 * 作業場所の存在・有効チェック + 工程マスタの許可リスト検証（null は許可）。
 * 許可リスト（process_step_work_locations）がある工程では、リストに含まれる
 * 場所しか計画・実績に使えない。エラー文言 or null。
 */
async function invalidWorkLocation(
  workLocationId: number | null,
  processStepId: number,
  tr: Awaited<ReturnType<typeof getTranslations>>,
): Promise<string | null> {
  if (workLocationId == null) return null;
  const location = await prisma.workLocation.findFirst({
    where: { id: workLocationId, isActive: true },
    select: { id: true },
  });
  if (!location) {
    return tr("production.stepExecutionActions.workLocationNotFound");
  }
  const allowed = await fetchAllowedWorkLocationIds(processStepId);
  if (allowed != null && !allowed.has(workLocationId)) {
    return tr("production.stepExecutionActions.workLocationNotAllowed");
  }
  return null;
}

/** 作業計画の追加 — 未完了（PENDING / IN_PROGRESS）の工程のみ。 */
export async function addStepPlan(
  payload: StepPlanInput,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = stepPlanInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? tr("common.invalidInput")],
    };
  }
  const v = parsed.data;
  const rangeError = validateTimeRange(v, tr);
  if (rangeError) return { ok: false, errors: [rangeError] };
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    if (step.status === "COMPLETED" || step.status === "CANCELLED") {
      return {
        ok: false,
        errors: [
          tr("production.stepExecutionActions.cannotAddPlanToCompletedStep"),
        ],
      };
    }
    const locationError = await invalidWorkLocation(
      v.workLocationId,
      step.processStepId,
      tr,
    );
    if (locationError) return { ok: false, errors: [locationError] };
    const actor = await getCurrentActorId();
    await prisma.workOrderStepPlan.create({
      data: {
        stepId: v.stepId,
        userId: v.userId,
        plannedDate: new Date(`${v.date}T00:00:00+09:00`),
        plannedStartAt: toJstTimestamp(v.date, v.startTime),
        plannedEndAt: toJstTimestamp(v.date, v.endTime),
        quantity: v.quantity,
        workLocationId: v.workLocationId,
        notes: v.notes.trim() || null,
        createdBy: actor,
      },
    });
    const timeText = v.startTime
      ? tr("production.stepExecutionActions.auditTimeSuffix", {
          start: v.startTime,
          end: v.endTime ?? "",
        })
      : "";
    const quantityText =
      v.quantity != null
        ? tr("production.stepExecutionActions.auditQuantitySuffix", {
            quantity: v.quantity,
          })
        : "";
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: {
        note: tr("production.stepExecutionActions.auditPlanAdded", {
          date: v.date,
          time: timeText,
          quantity: quantityText,
        }),
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, tr("production.stepExecutionActions.couldNotAddPlan"));
  }
}

/** 作業計画の削除。 */
export async function deleteStepPlan(
  workOrderNumber: number,
  stepId: string,
  planId: string,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    const deleted = await prisma.workOrderStepPlan.deleteMany({
      where: { id: planId, stepId },
    });
    if (deleted.count === 0) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.planNotFound")],
      };
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: { note: tr("production.stepExecutionActions.auditPlanDeleted") },
    });
    revalidate(workOrderNumber, stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, tr("production.stepExecutionActions.couldNotDeletePlan"));
  }
}

/** 作業実績の追加 — 進行中（IN_PROGRESS）の工程のみ。 */
export async function addStepActual(
  payload: StepActualInput,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const parsed = stepActualInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [parsed.error.issues[0]?.message ?? tr("common.invalidInput")],
    };
  }
  const v = parsed.data;
  const rangeError = validateTimeRange(v, tr);
  if (rangeError) return { ok: false, errors: [rangeError] };
  try {
    const step = await findStep(v.workOrderNumber, v.stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    if (step.status !== "IN_PROGRESS") {
      return {
        ok: false,
        errors: [
          tr("production.stepExecutionActions.onlyInProgressCanRecordActual"),
        ],
      };
    }
    const locationError = await invalidWorkLocation(
      v.workLocationId,
      step.processStepId,
      tr,
    );
    if (locationError) return { ok: false, errors: [locationError] };
    const actor = await getCurrentActorId();
    await prisma.workOrderStepActual.create({
      data: {
        stepId: v.stepId,
        userId: v.userId,
        workedDate: new Date(`${v.date}T00:00:00+09:00`),
        startedAt: toJstTimestamp(v.date, v.startTime),
        endedAt: toJstTimestamp(v.date, v.endTime),
        quantity: v.quantity,
        workLocationId: v.workLocationId,
        notes: v.notes.trim() || null,
        createdBy: actor,
      },
    });
    const timeText = v.startTime
      ? tr("production.stepExecutionActions.auditTimeSuffix", {
          start: v.startTime,
          end: v.endTime ?? "",
        })
      : "";
    const quantityText =
      v.quantity != null
        ? tr("production.stepExecutionActions.auditQuantitySuffix", {
            quantity: v.quantity,
          })
        : "";
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(v.workOrderNumber),
      after: {
        note: tr("production.stepExecutionActions.auditActualAdded", {
          date: v.date,
          time: timeText,
          quantity: quantityText,
        }),
      },
    });
    revalidate(v.workOrderNumber, v.stepId);
    return { ok: true };
  } catch (e) {
    return failed(e, tr("production.stepExecutionActions.couldNotAddActual"));
  }
}

/** 作業実績の削除 — 工程が完了する前まで。 */
export async function deleteStepActual(
  workOrderNumber: number,
  stepId: string,
  actualId: string,
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    if (step.status === "COMPLETED" || step.status === "CANCELLED") {
      return {
        ok: false,
        errors: [
          tr(
            "production.stepExecutionActions.cannotDeleteActualOfCompletedStep",
          ),
        ],
      };
    }
    const deleted = await prisma.workOrderStepActual.deleteMany({
      where: { id: actualId, stepId },
    });
    if (deleted.count === 0) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.actualNotFound")],
      };
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        note: tr("production.stepExecutionActions.auditActualDeleted"),
      },
    });
    revalidate(workOrderNumber, stepId);
    return { ok: true };
  } catch (e) {
    return failed(
      e,
      tr("production.stepExecutionActions.couldNotDeleteActual"),
    );
  }
}

// ── 検査表割当 (work_order_step_inspection_templates) ───────────────────────

/**
 * 工程の検査表割当を丸ごと入れ替える（この工程の検査表ポップアップの保存）。
 * 書き込み専用の Server Action — 表示は fetchStepExecution の
 * templates/templateOptions が持つ。作成時の既定選択（templatesFor）とは
 * 別経路: あちらは指示書の作成/DRAFT編集時にのみ効き、こちらは承認後の
 * 工程実行画面から検査表そのものを付け替える唯一の場所。
 */
export async function updateStepInspectionTemplates(
  workOrderNumber: number,
  stepId: string,
  templateIds: number[],
): Promise<StepActionResult> {
  const tr = await getTranslations();
  const denied = await deniedStepPermission("UPDATE");
  if (denied) return denied;
  const ids = [...new Set(templateIds)].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  try {
    const step = await findStep(workOrderNumber, stepId);
    if (!step) {
      return {
        ok: false,
        errors: [tr("production.stepExecutionActions.stepNotFound")],
      };
    }
    if (ids.length > 0) {
      const found = await prisma.inspectionTemplate.count({
        where: { id: { in: ids } },
      });
      if (found !== ids.length) {
        return {
          ok: false,
          errors: [
            tr("production.stepExecutionActions.inspectionSheetNotFound"),
          ],
        };
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.workOrderStepInspectionTemplate.deleteMany({
        where: { stepId, inspectionTemplateId: { notIn: ids } },
      });
      if (ids.length > 0) {
        await tx.workOrderStepInspectionTemplate.createMany({
          data: ids.map((inspectionTemplateId) => ({
            stepId,
            inspectionTemplateId,
          })),
          skipDuplicates: true,
        });
      }
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_orders",
      recordId: String(workOrderNumber),
      after: {
        note: tr("production.stepExecutionActions.auditInspectionSheetsSet", {
          count: ids.length,
        }),
      },
    });
    revalidate(workOrderNumber, stepId);
    return { ok: true };
  } catch (e) {
    return failed(
      e,
      tr("production.stepExecutionActions.couldNotSaveInspectionSheets"),
    );
  }
}
