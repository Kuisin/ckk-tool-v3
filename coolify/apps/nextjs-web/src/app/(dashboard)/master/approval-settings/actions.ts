"use server";

/**
 * Server Actions — 承認設定 (MS0B).
 *
 * 2 つのものを扱う:
 *   承認フロー（approval_flows / approval_flow_steps）— 書類種別ごとに
 *     「何段目にどのグループが、どのモードで」を並べる。
 *   承認グループ（approval_groups）— 承認者の集合。メンバーは常任と期間限定
 *     （valid_from / valid_until）があり、さらに期間限定代理
 *     （approval_delegates）を持てる。
 *
 * メンバー・代理操作の監査はグループ行（recordId = String(groupId)）に、
 * フローの保存は approval_flows 行（recordId = target_type）に記録する。
 */

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { validateConditions } from "@/lib/approval-conditions";
import { validateFlowSteps } from "@/lib/approval-flow";
import {
  isMemberEffective,
  validateMemberPeriod,
} from "@/lib/approval-membership";
import {
  APPLY_MODE_TARGETS,
  APPROVAL_TARGET_TYPES,
  type ApprovalTargetType,
} from "@/lib/approval-targets";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/master/approval-settings";

// 編集可能フィールド（type は識別 — 作成後不変）
function groupUpdateInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    nameJa: z.string().min(1, tr("master.approvalGroupForm.enterNameJa")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    isActive: z.boolean(),
  });
}

const groupCreateInputSchema = groupUpdateInputSchema;

export type ApprovalGroupUpdateInput = z.infer<
  ReturnType<typeof groupUpdateInputSchema>
>;
export type ApprovalGroupCreateInput = z.infer<
  ReturnType<typeof groupCreateInputSchema>
>;

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

/** Prisma known error の code を取り出す（P2002 個別ハンドリング用）。 */
function prismaErrorCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e
    ? String((e as { code: unknown }).code)
    : undefined;
}

export async function createApprovalGroup(
  input: ApprovalGroupCreateInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupCreateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const created = await prisma.approvalGroup.create({
      data: {
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        isActive: v.isActive,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "approval_groups",
      recordId: String(created.id),
      after: { nameJa: v.nameJa, isActive: v.isActive },
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.groupCreateFailed"),
        tr,
      ),
    );
  }
}

export async function updateApprovalGroup(
  id: number,
  input: ApprovalGroupUpdateInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupUpdateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const prior = await prisma.approvalGroup.findUnique({
      where: { id },
      select: { name: true, isActive: true },
    });
    await prisma.approvalGroup.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        isActive: v.isActive,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_groups",
      recordId: String(id),
      before: prior
        ? {
            nameJa: localized(prior.name as LocalizedText | null),
            isActive: prior.isActive,
          }
        : undefined,
      after: { nameJa: v.nameJa, isActive: v.isActive },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.groupUpdateFailed"),
        tr,
      ),
    );
  }
}

export async function setApprovalGroupsActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    await prisma.approvalGroup.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "approval_groups",
        recordId: String(id),
        after: { isActive },
      });
    }
    revalidate();
    for (const id of ids) revalidatePath(`${BASE_PATH}/${id}`);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.statusUpdateFailed"),
        tr,
      ),
    );
  }
}

export async function deleteApprovalGroups(
  ids: number[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    // メンバーは onDelete: Cascade で一括削除。将来 承認依頼・代理設定が
    // グループを参照するようになると P2003 で拒否される。
    await prisma.approvalGroup.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "approval_groups",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.groupDeleteFailed"),
        tr,
      ),
    );
  }
}

// ── メンバー（グループ詳細のタブから操作） ──────────────────────────────────

/** 監査ノート用のユーザー表示名（見つからなければ id をそのまま出す）。 */
async function memberLabel(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });
  return user?.displayName ?? userId;
}

/**
 * メンバーの追加。常任は period を省略、期間限定は開始・終了の日時を渡す。
 *
 * 期間限定メンバーは「その期間だけグループの一員」— 代理（addDelegate）とは
 * 別物で、代理は「本来の承認者の代わりに押す」（承認記録に原承認者が残る）。
 */
export async function addGroupMember(
  groupId: number,
  userId: string,
  period?: { validFrom: string; validUntil: string; note?: string },
): Promise<ActionResult> {
  const tr = await getTranslations();
  // メンバー・代理の増減はグループ本体の編集扱い（監査も UPDATE で記録）。
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!userId) return actionError(tr("master.approvalSettings.selectAUser"));
  const periodError = validateMemberPeriod({
    validFrom: period?.validFrom ?? null,
    validUntil: period?.validUntil ?? null,
  });
  if (periodError) return actionError(periodError);
  try {
    await prisma.approvalGroupMember.create({
      data: {
        groupId,
        userId,
        isActive: true,
        validFrom: period ? new Date(period.validFrom) : null,
        validUntil: period ? new Date(period.validUntil) : null,
        note: period?.note?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_groups",
      recordId: String(groupId),
      after: {
        note: period
          ? tr("master.approvalSettingsActions.periodMemberAddedAudit", {
              name: await memberLabel(userId),
              from: period.validFrom,
              until: period.validUntil,
            })
          : tr("master.approvalSettingsActions.memberAddedAudit", {
              name: await memberLabel(userId),
            }),
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    if (prismaErrorCode(e) === "P2002") {
      return actionError(tr("master.approvalSettingsActions.alreadyAMember"));
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.memberAddFailed"),
        tr,
      ),
    );
  }
}

/** メンバー行の削除（リレーション行の物理削除）。 */
export async function removeGroupMember(
  groupId: number,
  userId: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  // メンバー・代理の増減はグループ本体の編集扱い（監査も UPDATE で記録）。
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.approvalGroupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_groups",
      recordId: String(groupId),
      after: {
        note: tr("master.approvalSettingsActions.memberRemovedAudit", {
          name: await memberLabel(userId),
        }),
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.memberRemoveFailed"),
        tr,
      ),
    );
  }
}

// ── 期間限定代理（グループ詳細の代理設定タブから操作） ───────────────────────

function delegateInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z
    .object({
      delegatorId: z
        .string()
        .min(1, tr("master.approvalSettings.selectTheOriginalApprover")),
      delegateId: z
        .string()
        .min(1, tr("master.approvalSettings.selectADelegate")),
      validFrom: z
        .string()
        .min(1, tr("master.approvalSettings.selectAStartDate")),
      validUntil: z
        .string()
        .min(1, tr("master.approvalSettings.selectAnEndDate")),
      reason: z.string().optional(),
    })
    .refine((v) => v.delegatorId !== v.delegateId, {
      message: tr("master.approvalSettings.theOriginalApproverAndTheDelegate"),
    })
    .refine((v) => v.validFrom <= v.validUntil, {
      message: tr("master.approvalSettings.chooseAnEndDateOnOr"),
    });
}

export type ApprovalDelegateInput = z.infer<
  ReturnType<typeof delegateInputSchema>
>;

/**
 * 代理設定の追加。原承認者はグループの有効メンバーであること。
 * 期間は日付単位（開始日 00:00 〜 終了日 23:59:59.999、サーバーローカル時刻）。
 */
export async function addDelegate(
  groupId: number,
  input: ApprovalDelegateInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = delegateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    // 原承認者は「今この瞬間に承認できる人」であること（期間限定メンバーの
    // 期間外は代理も立てられない）。
    const member = await prisma.approvalGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: v.delegatorId } },
      select: { isActive: true, validFrom: true, validUntil: true },
    });
    if (!member || !isMemberEffective(member, new Date())) {
      return actionError(
        tr(
          "master.approvalSettingsActions.originalApproverMustBeEffectiveMember",
        ),
      );
    }
    const actor = await getCurrentActorId();
    await prisma.approvalDelegate.create({
      data: {
        groupId,
        delegatorId: v.delegatorId,
        delegateId: v.delegateId,
        validFrom: new Date(`${v.validFrom}T00:00:00`),
        validUntil: new Date(`${v.validUntil}T23:59:59.999`),
        reason: v.reason?.trim() || null,
        createdBy: actor,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_groups",
      recordId: String(groupId),
      after: {
        note: tr("master.approvalSettingsActions.delegateAddedAudit", {
          delegator: await memberLabel(v.delegatorId),
          delegate: await memberLabel(v.delegateId),
          from: v.validFrom,
          until: v.validUntil,
        }),
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.delegateAddFailed"),
        tr,
      ),
    );
  }
}

/** 代理設定の削除（行の物理削除）。 */
export async function removeDelegate(
  groupId: number,
  delegateRowId: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.approvalDelegate.findFirst({
      where: { id: delegateRowId, groupId },
      include: {
        delegator: { select: { displayName: true } },
        delegate: { select: { displayName: true } },
      },
    });
    if (!prior)
      return actionError(tr("master.approvalSettingsActions.delegateNotFound"));
    await prisma.approvalDelegate.delete({ where: { id: prior.id } });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_groups",
      recordId: String(groupId),
      after: {
        note: tr("master.approvalSettingsActions.delegateRemovedAudit", {
          delegator: prior.delegator.displayName,
          delegate: prior.delegate.displayName,
        }),
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.delegateRemoveFailed"),
        tr,
      ),
    );
  }
}

export async function setGroupMemberActive(
  groupId: number,
  userId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.approvalGroupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { isActive },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_groups",
      recordId: String(groupId),
      after: {
        note: tr("master.approvalSettingsActions.memberStatusChangedAudit", {
          name: await memberLabel(userId),
          action: isActive ? tr("common.enable") : tr("common.disable"),
        }),
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.memberStatusUpdateFailed"),
        tr,
      ),
    );
  }
}

// ── 承認フロー（書類種別ごとに 1 本） ───────────────────────────────────────

function flowStepInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    nameJa: z.string().min(1, tr("sales.discountRuleModal.enterAName")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    groupId: z
      .number()
      .int()
      .positive(tr("master.approvalSettingsActions.selectAnApprovalGroup")),
    mode: z.enum(["ANY", "ALL"]),
  });
}

function flowInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    targetType: z.enum(APPROVAL_TARGET_TYPES),
    steps: z
      .array(flowStepInputSchema(tr))
      .min(1, tr("master.approvalSettingsActions.setAtLeastOneApprovalStep")),
  });
}

export type ApprovalFlowStepInput = z.infer<
  ReturnType<typeof flowStepInputSchema>
>;

/**
 * 承認フローの保存（全段を置き換える）。
 *
 * 並べ替えは delete-then-create にする — (target_type, step_no) に一意制約が
 * あるので、途中の状態で衝突させないため。進行中の依頼は
 * approval_flow_steps.id を参照していない（group_id と flow_snapshot を持つ）
 * ので、作り直しても影響しない。
 *
 * 定義の変更が効くのは **次の承認依頼から**。進行中の書類は依頼時点の
 * スナップショットのまま進む。
 */
export async function saveApprovalFlow(
  targetType: string,
  steps: ApprovalFlowStepInput[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = flowInputSchema(tr).safeParse({ targetType, steps });
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  // 画面と同じ検証をサーバー側でも通す（lib/approval-flow）
  const issues = validateFlowSteps(
    v.steps.map((s) => ({
      nameJa: s.nameJa,
      groupId: s.groupId,
      mode: s.mode,
    })),
    false,
    tr,
  );
  if (issues.length > 0) return actionError(issues[0]);

  try {
    const actor = await getCurrentActorId();
    const before = await prisma.approvalFlowStep.findMany({
      where: { targetType: v.targetType },
      orderBy: { stepNo: "asc" },
      select: { stepNo: true, name: true, groupId: true, mode: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.approvalFlow.upsert({
        where: { targetType: v.targetType },
        create: { targetType: v.targetType, updatedBy: actor },
        update: { updatedBy: actor },
      });
      await tx.approvalFlowStep.deleteMany({
        where: { targetType: v.targetType },
      });
      await tx.approvalFlowStep.createMany({
        data: v.steps.map((s, i) => ({
          targetType: v.targetType,
          stepNo: i + 1,
          name: localizedInput(s.nameJa, undefined, s.nameTranslations),
          groupId: s.groupId,
          mode: s.mode,
        })),
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_flows",
      recordId: v.targetType,
      before: {
        steps: before.map((s) => ({
          stepNo: s.stepNo,
          name: localized(s.name as LocalizedText | null),
          groupId: s.groupId,
          mode: s.mode,
        })),
      },
      after: {
        steps: v.steps.map((s, i) => ({
          stepNo: i + 1,
          name: s.nameJa,
          groupId: s.groupId,
          mode: s.mode,
        })),
      },
    });
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/flows/${v.targetType}`);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.flowSaveFailed"),
        tr,
      ),
    );
  }
}

/**
 * メンバーの在籍期間の変更。period を省略すると常任に戻す。
 */
export async function updateGroupMemberValidity(
  groupId: number,
  userId: string,
  period?: { validFrom: string; validUntil: string; note?: string },
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const periodError = validateMemberPeriod({
    validFrom: period?.validFrom ?? null,
    validUntil: period?.validUntil ?? null,
  });
  if (periodError) return actionError(periodError);
  try {
    await prisma.approvalGroupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: {
        validFrom: period ? new Date(period.validFrom) : null,
        validUntil: period ? new Date(period.validUntil) : null,
        note: period?.note?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_groups",
      recordId: String(groupId),
      after: {
        note: period
          ? tr("master.approvalSettingsActions.memberPeriodChangedAudit", {
              name: await memberLabel(userId),
              from: period.validFrom,
              until: period.validUntil,
            })
          : tr("master.approvalSettingsActions.memberSetToPermanentAudit", {
              name: await memberLabel(userId),
            }),
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.memberPeriodUpdateFailed"),
        tr,
      ),
    );
  }
}

// ── 条件付き承認フロー（approval_flow_rules） ────────────────────────────────
//
// 書類種別ごとに 0..N 本。priority 昇順で評価し、依頼時に最初に一致した 1 本の
// 段構成を既定フローの代わりに使う（解決は lib/approvals.ts）。条件の語彙と
// 検証は lib/approval-conditions.ts が唯一の定義。監査は recordId =
// `<target_type>#<rule id>` で残す。

function flowConditionInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    field: z
      .string()
      .min(1, tr("master.approvalSettingsActions.selectAConditionField")),
    op: z.enum(["eq", "ne", "gte", "lte"]),
    value: z.union([z.string(), z.number()]),
  });
}

function flowRuleInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    targetType: z.enum(APPROVAL_TARGET_TYPES),
    nameJa: z
      .string()
      .min(1, tr("master.approvalFlows.enterTheRuleNameInJapanese")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    conditions: z.array(flowConditionInputSchema(tr)),
    steps: z
      .array(flowStepInputSchema(tr))
      .min(1, tr("master.approvalSettingsActions.setAtLeastOneApprovalStep")),
  });
}

export type ApprovalFlowRuleInput = Omit<
  z.infer<ReturnType<typeof flowRuleInputSchema>>,
  "targetType"
>;

function revalidateFlow(targetType: string) {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/flows/${targetType}`);
}

/** 作成（ruleId = null）/ 更新。段と条件は全置換。 */
export async function saveApprovalFlowRule(
  targetType: string,
  ruleId: number | null,
  input: ApprovalFlowRuleInput,
): Promise<ActionResult<{ ruleId: number }>> {
  const [tr, locale] = await Promise.all([getTranslations(), getLocale()]);
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = flowRuleInputSchema(tr).safeParse({ targetType, ...input });
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  // 画面と同じ検証をサーバー側でも通す（段: approval-flow / 条件: approval-conditions）
  const stepIssues = validateFlowSteps(
    v.steps.map((s) => ({
      nameJa: s.nameJa,
      groupId: s.groupId,
      mode: s.mode,
    })),
    false,
    tr,
  );
  if (stepIssues.length > 0) return actionError(stepIssues[0]);
  const condIssues = validateConditions(v.targetType, v.conditions, locale, tr);
  if (condIssues.length > 0) return actionError(condIssues[0]);

  try {
    const actor = await getCurrentActorId();
    const savedId = await prisma.$transaction(async (tx) => {
      // ルールは approval_flows 行にぶら下がる（FK）— 既定フロー未保存でも
      // 作れるよう upsert しておく
      await tx.approvalFlow.upsert({
        where: { targetType: v.targetType },
        create: { targetType: v.targetType, updatedBy: actor },
        update: {},
      });
      let id: number;
      if (ruleId == null) {
        const last = await tx.approvalFlowRule.aggregate({
          where: { targetType: v.targetType },
          _max: { priority: true },
        });
        const created = await tx.approvalFlowRule.create({
          data: {
            targetType: v.targetType,
            name: localizedInput(v.nameJa, undefined, v.nameTranslations),
            priority: (last._max.priority ?? -1) + 1,
            conditions: v.conditions,
            updatedBy: actor,
          },
          select: { id: true },
        });
        id = created.id;
      } else {
        const updated = await tx.approvalFlowRule.updateMany({
          where: { id: ruleId, targetType: v.targetType },
          data: {
            name: localizedInput(v.nameJa, undefined, v.nameTranslations),
            conditions: v.conditions,
            updatedBy: actor,
          },
        });
        if (updated.count === 0) {
          throw new Error(
            `GUARD:${tr("master.approvalSettingsActions.ruleNotFound")}`,
          );
        }
        id = ruleId;
        await tx.approvalFlowRuleStep.deleteMany({ where: { ruleId: id } });
      }
      await tx.approvalFlowRuleStep.createMany({
        data: v.steps.map((s, i) => ({
          ruleId: id,
          stepNo: i + 1,
          name: localizedInput(s.nameJa, undefined, s.nameTranslations),
          groupId: s.groupId,
          mode: s.mode,
        })),
      });
      return id;
    });
    await recordAudit({
      action: ruleId == null ? "CREATE" : "UPDATE",
      tableName: "approval_flow_rules",
      recordId: `${v.targetType}#${savedId}`,
      after: {
        name: v.nameJa,
        conditions: v.conditions,
        steps: v.steps.map((s, i) => ({
          stepNo: i + 1,
          name: s.nameJa,
          groupId: s.groupId,
          mode: s.mode,
        })),
      },
    });
    revalidateFlow(v.targetType);
    return actionOk({ ruleId: savedId });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.conditionalFlowSaveFailed"),
        tr,
      ),
    );
  }
}

/** 削除（段はカスケード）。進行中の依頼は flow_snapshot を持つので影響しない。 */
export async function deleteApprovalFlowRule(
  targetType: string,
  ruleId: number,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.approvalFlowRule.findFirst({
      where: { id: ruleId, targetType },
      select: { name: true, conditions: true },
    });
    if (!prior)
      return actionError(tr("master.approvalSettingsActions.ruleNotFound"));
    await prisma.approvalFlowRule.delete({ where: { id: ruleId } });
    await recordAudit({
      action: "DELETE",
      tableName: "approval_flow_rules",
      recordId: `${targetType}#${ruleId}`,
      before: {
        name: localized(prior.name as LocalizedText | null),
        conditions: prior.conditions,
      },
    });
    revalidateFlow(targetType);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.conditionalFlowDeleteFailed"),
        tr,
      ),
    );
  }
}

/** 有効 / 無効の切り替え（無効は依頼時の評価から外れる）。 */
export async function toggleApprovalFlowRule(
  targetType: string,
  ruleId: number,
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const updated = await prisma.approvalFlowRule.updateMany({
      where: { id: ruleId, targetType },
      data: { isActive },
    });
    if (updated.count === 0) {
      return actionError(tr("master.approvalSettingsActions.ruleNotFound"));
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_flow_rules",
      recordId: `${targetType}#${ruleId}`,
      after: { isActive },
    });
    revalidateFlow(targetType);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.toggleFailed"),
        tr,
      ),
    );
  }
}

/** 優先順の移動（up = 先に評価される側へ）。priority は 0..N-1 に振り直す。 */
export async function moveApprovalFlowRule(
  targetType: string,
  ruleId: number,
  direction: "up" | "down",
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const rows = await prisma.approvalFlowRule.findMany({
      where: { targetType },
      orderBy: { priority: "asc" },
      select: { id: true },
    });
    const index = rows.findIndex((r) => r.id === ruleId);
    if (index < 0)
      return actionError(tr("master.approvalSettingsActions.ruleNotFound"));
    const to = index + (direction === "up" ? -1 : 1);
    if (to < 0 || to >= rows.length) return actionOk(); // 端 — 何もしない
    const order = [...rows];
    [order[index], order[to]] = [order[to], order[index]];
    await prisma.$transaction(
      order.map((r, i) =>
        prisma.approvalFlowRule.update({
          where: { id: r.id },
          data: { priority: i },
        }),
      ),
    );
    revalidateFlow(targetType);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.reorderFailed"),
        tr,
      ),
    );
  }
}

/**
 * 承認フローの適用モード（approval_flows.apply_mode）。
 * PRE = 承認後に適用（既定） / POST = 即時適用 + 事後承認。
 * 対応 target（APPLY_MODE_TARGETS — 現状 工程フロー変更のみ）に限る。
 */
export async function setApprovalApplyMode(
  targetType: string,
  applyMode: "PRE" | "POST",
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!APPLY_MODE_TARGETS.includes(targetType as ApprovalTargetType)) {
    return actionError(
      tr("master.approvalSettingsActions.applyModeNotSupportedForTargetType"),
    );
  }
  if (applyMode !== "PRE" && applyMode !== "POST") {
    return actionError(tr("master.approvalSettingsActions.invalidApplyMode"));
  }
  try {
    const actor = await getCurrentActorId();
    const before = await prisma.approvalFlow.findUnique({
      where: { targetType },
      select: { applyMode: true },
    });
    await prisma.approvalFlow.upsert({
      where: { targetType },
      create: { targetType, applyMode, updatedBy: actor },
      update: { applyMode, updatedBy: actor },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_flows",
      recordId: targetType,
      before: { applyMode: before?.applyMode ?? "PRE" },
      after: { applyMode },
    });
    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/flows/${targetType}`);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.approvalSettingsActions.applyModeSaveFailed"),
        tr,
      ),
    );
  }
}
