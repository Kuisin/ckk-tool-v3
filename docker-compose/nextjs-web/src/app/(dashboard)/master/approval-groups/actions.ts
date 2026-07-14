"use server";

/**
 * Server Actions — 承認グループ (MS0A).
 *
 * グループ本体の CRUD と、メンバー（approval_group_members）の追加・削除・
 * 有効/無効切替（design.md §13.5 — メンバーはグループ詳細のタブで管理）。
 * 種別（type）はグループの識別であり作成後変更不可。メンバー操作の監査は
 * グループ行（recordId = String(groupId)）に記録する。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
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

export async function setGroupMemberActive(
  groupId: number,
  userId: string,
  isActive: boolean,
): Promise<ActionResult> {
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
