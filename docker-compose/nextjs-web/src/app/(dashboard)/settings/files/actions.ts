"use server";

/**
 * ファイル管理 (SY06) — フォルダ権限（file_folder_grants）の管理アクション。
 * 権限付与・剥奪は system:ADMIN のみ。付与対象ユーザーの選択肢もここで返す。
 */

import { revalidatePath } from "next/cache";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { z } from "zod";

const BASE_PATH = "/settings/files";

export interface FolderGrantRow {
  id: number;
  pathPrefix: string;
  userId: string;
  userName: string;
  username: string;
  canWrite: boolean;
  createdAt: string | null;
}

export interface GrantUserOption {
  value: string;
  label: string;
}

export async function fetchFolderGrants(): Promise<
  ActionResult<{ grants: FolderGrantRow[]; users: GrantUserOption[] }>
> {
  const authz = await checkPermission("system", "ADMIN");
  if (!authz.ok) return actionError(authz.error);
  const [grants, users] = await Promise.all([
    prisma.fileFolderGrant.findMany({
      orderBy: [{ pathPrefix: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { displayName: true, username: true } } },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { username: "asc" },
      select: { id: true, displayName: true, username: true },
    }),
  ]);
  return actionOk({
    grants: grants.map((g) => ({
      id: g.id,
      pathPrefix: g.pathPrefix,
      userId: g.userId,
      userName: g.user.displayName,
      username: g.user.username,
      canWrite: g.canWrite,
      createdAt: g.createdAt?.toISOString() ?? null,
    })),
    users: users.map((u) => ({
      value: u.id,
      label: `${u.displayName} (${u.username})`,
    })),
  });
}

const grantSchema = z.object({
  pathPrefix: z
    .string()
    .trim()
    .min(1, "フォルダを指定してください")
    .regex(/^[^\0]+$/)
    .refine((v) => !v.includes(".."), "不正なパスです")
    .transform((v) => v.replace(/^\/+|\/+$/g, "")),
  userId: z.string().uuid("ユーザーを選択してください"),
  canWrite: z.boolean(),
});

export async function upsertFolderGrant(input: {
  pathPrefix: string;
  userId: string;
  canWrite: boolean;
}): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("system", "ADMIN");
  if (!authz.ok) return actionError(authz.error);
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  if (!v.pathPrefix) return actionError("フォルダを指定してください");
  try {
    const actorId = await getCurrentActorId();
    const row = await prisma.fileFolderGrant.upsert({
      where: {
        pathPrefix_userId: { pathPrefix: v.pathPrefix, userId: v.userId },
      },
      create: {
        pathPrefix: v.pathPrefix,
        userId: v.userId,
        canWrite: v.canWrite,
        createdBy: actorId,
      },
      update: { canWrite: v.canWrite },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "file_folder_grants",
      recordId: String(row.id),
      after: {
        pathPrefix: v.pathPrefix,
        userId: v.userId,
        canWrite: v.canWrite,
      },
    });
    revalidatePath(BASE_PATH);
    return actionOk({ id: row.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "権限の保存に失敗しました"));
  }
}

export async function deleteFolderGrant(
  id: number,
): Promise<ActionResult<null>> {
  const authz = await checkPermission("system", "ADMIN");
  if (!authz.ok) return actionError(authz.error);
  try {
    const row = await prisma.fileFolderGrant.delete({ where: { id } });
    await recordAudit({
      action: "DELETE",
      tableName: "file_folder_grants",
      recordId: String(id),
      before: {
        pathPrefix: row.pathPrefix,
        userId: row.userId,
        canWrite: row.canWrite,
      },
    });
    revalidatePath(BASE_PATH);
    return actionOk(null);
  } catch (e) {
    return actionError(prismaErrorMessage(e, "権限の削除に失敗しました"));
  }
}
