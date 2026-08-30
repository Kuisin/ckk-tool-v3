import "server-only";

/**
 * share-grants.ts — レコード単位の共有の読み書き（server-only）。
 *
 * 判定そのものは lib/share-grants-core.ts（純関数・テスト付き）が持ち、ここは
 * 「DB から行を集めて、いまのユーザーの拠点・ロールと突き合わせる」だけを担う。
 *
 * owner の規約は既存の多態テーブル（document_memos / document_attachments /
 * audit_logs）と同じ: ownerType = @@map 名、ownerId = 業務キー文字列、FK なし。
 * 親が消えたときの掃除は DB のトリガ（app.purge_share_grants）が持つ。
 */

import { cache } from "react";
import { getPermissionSet, sessionUserId } from "./authz";
import { prisma } from "./db";
import {
  canNotifyOnComplete,
  resolveShareAccess,
  type ShareAccess,
  type ShareGrantRow,
  type ShareLevel,
  type ShareSubjectType,
} from "./share-grants-core";

export type { ShareAccess, ShareLevel, ShareSubjectType };

/** 何も見えない状態。フォームが存在しないときの既定として使い回す。 */
export const NO_SHARE_ACCESS: ShareAccess = {
  canRespond: false,
  canRead: false,
  canEdit: false,
  canManage: false,
  responseScope: { all: false, conditions: [] },
};

export interface ShareGrantView {
  conditionFieldKey?: string | null;
  conditionValues?: string[];
  conditionLabels?: string[];
  id: string;
  subjectType: ShareSubjectType;
  subjectId: string | null;
  /** 画面に出す名前（拠点名・ロール名・ユーザー名）。解決できなければ id。 */
  subjectLabel: string;
  level: ShareLevel;
  /** 申請・報告が完了したときに、この共有先へ通知するか（フォームのみ）。 */
  notifyOnComplete: boolean;
}

/** 現在ユーザーの所属拠点 id とロール id（リクエスト単位でメモ化）。 */
const subjectContextFor = cache(
  async (
    userId: string,
  ): Promise<{ plantIds: string[]; roleIds: string[] }> => {
    const [plants, roles] = await Promise.all([
      prisma.userPlant.findMany({
        where: { userId },
        select: { plantId: true },
      }),
      prisma.userRoleRelation.findMany({
        where: { userId, isActive: true },
        select: { roleId: true },
      }),
    ]);
    return {
      plantIds: plants.map((p) => String(p.plantId)),
      roleIds: roles.map((r) => String(r.roleId)),
    };
  },
);

async function grantRowsFor(
  ownerType: string,
  ownerId: string,
): Promise<ShareGrantRow[]> {
  const rows = await prisma.shareGrant.findMany({
    where: { ownerType, ownerId },
    select: {
      subjectType: true,
      subjectId: true,
      level: true,
      conditionFieldKey: true,
      conditionValues: true,
    },
  });
  return rows.map(toGrantRow);
}

/**
 * いまのユーザーがこのレコードに対して何をできるか。
 * `createdBy` を渡すと作成者本人を常に MANAGE として扱う。
 */
/** DB 行 → 判定用の行。条件は「項目が指定されていて値が 1 つ以上」のときだけ。 */
function toGrantRow(row: {
  subjectType: string;
  subjectId: string | null;
  level: string;
  conditionFieldKey?: string | null;
  conditionValues?: string[];
}): ShareGrantRow {
  const values = row.conditionValues ?? [];
  return {
    subjectType: row.subjectType as ShareGrantRow["subjectType"],
    subjectId: row.subjectId,
    level: row.level as ShareGrantRow["level"],
    condition:
      row.conditionFieldKey && values.length > 0
        ? { fieldKey: row.conditionFieldKey, values }
        : null,
  };
}

export async function shareAccessFor(
  ownerType: string,
  ownerId: string,
  createdBy?: string | null,
): Promise<ShareAccess> {
  const userId = await sessionUserId();
  if (!userId) {
    return {
      canRespond: false,
      canRead: false,
      canEdit: false,
      canManage: false,
      responseScope: { all: false, conditions: [] },
    };
  }
  const [grants, ctx, permissions] = await Promise.all([
    grantRowsFor(ownerType, ownerId),
    subjectContextFor(userId),
    getPermissionSet(),
  ]);
  return resolveShareAccess(grants, {
    userId,
    plantIds: ctx.plantIds,
    roleIds: ctx.roleIds,
    isOwner: !!createdBy && createdBy === userId,
    isSuperuser: permissions?.superuser ?? false,
  });
}

/**
 * 一覧向け: 複数レコードの可視性をまとめて解く。
 * 1 レコードずつ shareAccessFor を呼ぶと N+1 になるので、grant をまとめて引く。
 */
export async function visibleOwnerIds(
  ownerType: string,
  owners: readonly { ownerId: string; createdBy: string | null }[],
): Promise<Set<string>> {
  const userId = await sessionUserId();
  if (!userId || owners.length === 0) return new Set();

  const [rows, ctx, permissions] = await Promise.all([
    prisma.shareGrant.findMany({
      where: { ownerType, ownerId: { in: owners.map((o) => o.ownerId) } },
      select: {
        ownerId: true,
        subjectType: true,
        subjectId: true,
        level: true,
      },
    }),
    subjectContextFor(userId),
    getPermissionSet(),
  ]);

  const byOwner = new Map<string, ShareGrantRow[]>();
  for (const row of rows) {
    const list = byOwner.get(row.ownerId) ?? [];
    list.push(row as ShareGrantRow);
    byOwner.set(row.ownerId, list);
  }

  const superuser = permissions?.superuser ?? false;
  const visible = new Set<string>();
  for (const owner of owners) {
    const access = resolveShareAccess(byOwner.get(owner.ownerId) ?? [], {
      userId,
      plantIds: ctx.plantIds,
      roleIds: ctx.roleIds,
      isOwner: owner.createdBy === userId,
      isSuperuser: superuser,
    });
    if (access.canRead || access.canRespond) visible.add(owner.ownerId);
  }
  return visible;
}

/** 共有設定の一覧（管理画面用。対象名を解決して返す）。 */
export async function listShareGrants(
  ownerType: string,
  ownerId: string,
): Promise<ShareGrantView[]> {
  try {
    const rows = await prisma.shareGrant.findMany({
      where: { ownerType, ownerId },
      orderBy: [{ subjectType: "asc" }, { createdAt: "asc" }],
    });
    if (rows.length === 0) return [];

    const plantIds = rows
      .filter((r) => r.subjectType === "PLANT" && r.subjectId)
      .map((r) => Number(r.subjectId));
    const roleIds = rows
      .filter((r) => r.subjectType === "ROLE" && r.subjectId)
      .map((r) => Number(r.subjectId));
    const userIds = rows
      .filter((r) => r.subjectType === "USER" && r.subjectId)
      .map((r) => r.subjectId as string);

    const [plants, roles, users] = await Promise.all([
      plantIds.length
        ? prisma.plant.findMany({
            where: { id: { in: plantIds } },
            select: { id: true, name: true },
          })
        : [],
      roleIds.length
        ? prisma.role.findMany({
            where: { id: { in: roleIds } },
            select: { id: true, displayName: true, rolename: true },
          })
        : [],
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, username: true },
          })
        : [],
    ]);

    const ja = (v: unknown): string | null =>
      typeof v === "object" && v != null && "ja" in v
        ? String((v as { ja: unknown }).ja ?? "")
        : null;

    const plantName = new Map(plants.map((p) => [String(p.id), ja(p.name)]));
    const roleName = new Map(
      roles.map((r) => [String(r.id), ja(r.displayName) || r.rolename]),
    );
    const userName = new Map(
      users.map((u) => [u.id, u.displayName || u.username]),
    );

    return rows.map((r) => ({
      id: r.id,
      subjectType: r.subjectType as ShareSubjectType,
      subjectId: r.subjectId,
      subjectLabel:
        r.subjectType === "EVERYONE"
          ? "全社（ログインユーザー全員）"
          : (r.subjectType === "PLANT"
              ? plantName.get(r.subjectId ?? "")
              : r.subjectType === "ROLE"
                ? roleName.get(r.subjectId ?? "")
                : userName.get(r.subjectId ?? "")) ||
            r.subjectId ||
            "（不明）",
      level: r.level as ShareLevel,
      notifyOnComplete: r.notifyOnComplete,
      conditionFieldKey: r.conditionFieldKey,
      conditionValues: r.conditionValues,
      conditionLabels: r.conditionLabels,
    }));
  } catch {
    // 共有設定が読めなくても画面自体は出したい。
    return [];
  }
}

export interface ShareGrantInput {
  subjectType: ShareSubjectType;
  subjectId: string | null;
  level: ShareLevel;
  /** READ のときだけ意味がある（それ以外では捨てる）。 */
  conditionFieldKey?: string | null;
  conditionValues?: string[];
  conditionLabels?: string[];
  /** 完了通知。読めない共有（RESPOND）に付いていても捨てる。 */
  notifyOnComplete?: boolean;
}

/**
 * 共有設定をまるごと置き換える（1 トランザクション）。
 * 差分更新にしないのは、UI が「いまの一覧」を送るだけで済み、
 * 消し忘れによる権限の残留が起きないため。
 */
export async function replaceShareGrants(
  ownerType: string,
  ownerId: string,
  grants: readonly ShareGrantInput[],
  actorId: string | null,
): Promise<void> {
  const clean = grants
    .map((g) => {
      // 条件は READ にだけ効く。EDIT/MANAGE に付いていても保存しない —
      // 残すと画面には条件が見えるのに効かない、という嘘の表示になる。
      const values = g.level === "READ" ? (g.conditionValues ?? []) : [];
      const fieldKey =
        g.level === "READ" && values.length > 0
          ? (g.conditionFieldKey ?? null)
          : null;
      const labels = fieldKey ? (g.conditionLabels ?? []) : [];
      return {
        subjectType: g.subjectType,
        subjectId: g.subjectType === "EVERYONE" ? null : (g.subjectId ?? null),
        level: g.level,
        // 完了通知は「その回答を読める共有」にだけ載る。RESPOND に付いたまま
        // 保存すると、開けない通知を送る設定を作れてしまう。
        notifyOnComplete: canNotifyOnComplete(g.level)
          ? (g.notifyOnComplete ?? false)
          : false,
        conditionFieldKey: fieldKey,
        conditionValues: fieldKey ? values : [],
        // ラベルは表示用の写し。数が合わないときは値をそのまま出す。
        conditionLabels: labels.length === values.length ? labels : [],
      };
    })
    .filter((g) => g.subjectType === "EVERYONE" || g.subjectId);

  // 同じ (対象, 権限) の重複を落とす（UI の二重追加対策）。
  const seen = new Set<string>();
  const unique = clean.filter((g) => {
    const key = `${g.subjectType}:${g.subjectId ?? ""}:${g.level}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await prisma.$transaction(async (tx) => {
    await tx.shareGrant.deleteMany({ where: { ownerType, ownerId } });
    if (unique.length === 0) return;
    await tx.shareGrant.createMany({
      data: unique.map((g) => ({
        ownerType,
        ownerId,
        subjectType: g.subjectType,
        subjectId: g.subjectId,
        level: g.level,
        notifyOnComplete: g.notifyOnComplete,
        conditionFieldKey: g.conditionFieldKey,
        conditionValues: g.conditionValues,
        conditionLabels: g.conditionLabels,
        createdBy: actorId,
      })),
    });
  });
}
