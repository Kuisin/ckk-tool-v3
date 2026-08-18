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
import { z } from "zod";
import { validateFlowSteps } from "@/lib/approval-flow";
import {
  isMemberEffective,
  validateMemberPeriod,
} from "@/lib/approval-membership";
import { APPROVAL_TARGET_TYPES } from "@/lib/approval-targets";
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
const groupUpdateInput = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  isActive: z.boolean(),
});

const groupCreateInput = groupUpdateInput;

export type ApprovalGroupUpdateInput = z.infer<typeof groupUpdateInput>;
export type ApprovalGroupCreateInput = z.infer<typeof groupCreateInput>;

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
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupCreateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.approvalGroup.create({
      data: {
        name: localizedInput(v.nameJa, v.nameEn),
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
      prismaErrorMessage(e, "承認グループの作成に失敗しました"),
    );
  }
}

export async function updateApprovalGroup(
  id: number,
  input: ApprovalGroupUpdateInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupUpdateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
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
        name: localizedInput(v.nameJa, v.nameEn),
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
      prismaErrorMessage(e, "承認グループの更新に失敗しました"),
    );
  }
}

export async function setApprovalGroupsActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
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
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

export async function deleteApprovalGroups(
  ids: number[],
): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
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
      prismaErrorMessage(e, "承認グループの削除に失敗しました"),
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
  // メンバー・代理の増減はグループ本体の編集扱い（監査も UPDATE で記録）。
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!userId) return actionError("ユーザーを選択してください");
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
          ? `期間限定メンバー「${await memberLabel(userId)}」を追加（${period.validFrom}〜${period.validUntil}）`
          : `メンバー「${await memberLabel(userId)}」を追加`,
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    if (prismaErrorCode(e) === "P2002") {
      return actionError("既にメンバーです");
    }
    return actionError(prismaErrorMessage(e, "メンバーの追加に失敗しました"));
  }
}

/** メンバー行の削除（リレーション行の物理削除）。 */
export async function removeGroupMember(
  groupId: number,
  userId: string,
): Promise<ActionResult> {
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
      after: { note: `メンバー「${await memberLabel(userId)}」を削除` },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "メンバーの削除に失敗しました"));
  }
}

// ── 期間限定代理（グループ詳細の代理設定タブから操作） ───────────────────────

const delegateInput = z
  .object({
    delegatorId: z.string().min(1, "原承認者を選択してください"),
    delegateId: z.string().min(1, "代理人を選択してください"),
    validFrom: z.string().min(1, "開始日を選択してください"),
    validUntil: z.string().min(1, "終了日を選択してください"),
    reason: z.string().optional(),
  })
  .refine((v) => v.delegatorId !== v.delegateId, {
    message: "原承認者と代理人は別のユーザーを選択してください",
  })
  .refine((v) => v.validFrom <= v.validUntil, {
    message: "終了日は開始日以降の日付を選択してください",
  });

export type ApprovalDelegateInput = z.infer<typeof delegateInput>;

/**
 * 代理設定の追加。原承認者はグループの有効メンバーであること。
 * 期間は日付単位（開始日 00:00 〜 終了日 23:59:59.999、サーバーローカル時刻）。
 */
export async function addDelegate(
  groupId: number,
  input: ApprovalDelegateInput,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = delegateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
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
      return actionError("原承認者はこのグループの有効なメンバーのみ選べます");
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
        note: `代理設定を追加（原承認者「${await memberLabel(v.delegatorId)}」→ 代理人「${await memberLabel(v.delegateId)}」、期間 ${v.validFrom}〜${v.validUntil}）`,
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "代理設定の追加に失敗しました"));
  }
}

/** 代理設定の削除（行の物理削除）。 */
export async function removeDelegate(
  groupId: number,
  delegateRowId: string,
): Promise<ActionResult> {
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
    if (!prior) return actionError("対象の代理設定が見つかりません");
    await prisma.approvalDelegate.delete({ where: { id: prior.id } });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_groups",
      recordId: String(groupId),
      after: {
        note: `代理設定を削除（原承認者「${prior.delegator.displayName}」→ 代理人「${prior.delegate.displayName}」）`,
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "代理設定の削除に失敗しました"));
  }
}

export async function setGroupMemberActive(
  groupId: number,
  userId: string,
  isActive: boolean,
): Promise<ActionResult> {
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
        note: `メンバー「${await memberLabel(userId)}」を${isActive ? "有効化" : "無効化"}`,
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "メンバー状態の更新に失敗しました"),
    );
  }
}

// ── 承認フロー（書類種別ごとに 1 本） ───────────────────────────────────────

const flowStepInput = z.object({
  nameJa: z.string().min(1, "名称を入力してください"),
  nameEn: z.string().optional(),
  groupId: z.number().int().positive("承認グループを選択してください"),
  mode: z.enum(["ANY", "ALL"]),
});

const flowInput = z.object({
  targetType: z.enum(APPROVAL_TARGET_TYPES),
  steps: z
    .array(flowStepInput)
    .min(1, "承認ステップを 1 段以上設定してください"),
});

export type ApprovalFlowStepInput = z.infer<typeof flowStepInput>;

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
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = flowInput.safeParse({ targetType, steps });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  // 画面と同じ検証をサーバー側でも通す（lib/approval-flow）
  const issues = validateFlowSteps(
    v.steps.map((s) => ({
      nameJa: s.nameJa,
      groupId: s.groupId,
      mode: s.mode,
    })),
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
          name: localizedInput(s.nameJa, s.nameEn),
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
    return actionError(prismaErrorMessage(e, "承認フローの保存に失敗しました"));
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
          ? `メンバー「${await memberLabel(userId)}」の期間を ${period.validFrom}〜${period.validUntil} に変更`
          : `メンバー「${await memberLabel(userId)}」を常任に変更`,
      },
    });
    revalidate(groupId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "在籍期間の更新に失敗しました"));
  }
}
