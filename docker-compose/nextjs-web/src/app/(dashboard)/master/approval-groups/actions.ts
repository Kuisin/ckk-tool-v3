"use server";

/**
 * Server Actions — 承認グループ (MS0A).
 *
 * グループ本体の CRUD と、メンバー（approval_group_members）の追加・削除・
 * 有効/無効切替（design.md §13.5 — メンバーはグループ詳細のタブで管理）、
 * および期間限定代理（approval_delegates）の追加・削除。
 * 種別（type）はグループの識別であり作成後変更不可。メンバー・代理操作の
 * 監査はグループ行（recordId = String(groupId)）に記録する。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
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

const BASE_PATH = "/master/approval-groups";

// 編集可能フィールド（type は識別 — 作成後不変）
const groupUpdateInput = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  isActive: z.boolean(),
});

const groupCreateInput = groupUpdateInput.extend({
  type: z.enum(["FIRST", "SECOND", "WORKFLOW_CHANGE"], {
    message: "種別を選択してください",
  }),
});

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
        type: v.type,
        name: localizedInput(v.nameJa, v.nameEn),
        isActive: v.isActive,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "approval_groups",
      recordId: String(created.id),
      after: { type: v.type, nameJa: v.nameJa, isActive: v.isActive },
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

export async function addGroupMember(
  groupId: number,
  userId: string,
): Promise<ActionResult> {
  // メンバー・代理の増減はグループ本体の編集扱い（監査も UPDATE で記録）。
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!userId) return actionError("ユーザーを選択してください");
  try {
    await prisma.approvalGroupMember.create({
      data: { groupId, userId, isActive: true },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "approval_groups",
      recordId: String(groupId),
      after: { note: `メンバー「${await memberLabel(userId)}」を追加` },
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
    const member = await prisma.approvalGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: v.delegatorId } },
      select: { isActive: true },
    });
    if (!member?.isActive) {
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
