import "server-only";

/**
 * approval-approvers.ts — 「今この段を承認できるのは誰か」を承認グループから引く。
 * 承認設定 (MS0B) の表示用。
 *
 * 承認できる人を決めるのは **承認グループの所属だけ** で、RBAC の権限は
 * 関係しない（かつては `<code>:APPROVE` という付与も要ったが、承認は承認管理
 * ＝承認フローと承認グループで決めるものなので廃止した）。実際の承認判定は
 * lib/approvals.ts の resolveApprover が同じ所属を見る。
 *
 * 期間外・無効のメンバーはそもそも押せないので除く（approval-membership の
 * effectiveMemberWhere = isMemberEffective と同じ条件）。代理
 * （approval_delegates）は「本来の承認者の代わりに押す」別の軸なので含めない。
 */

import { effectiveMemberWhere } from "./approval-membership";
import { prisma } from "./db";

/** 承認グループの実効メンバー 1 人ぶん。 */
export interface GroupApprover {
  userId: string;
  displayName: string;
  username: string;
}

/**
 * 承認グループの「今この瞬間に承認できるメンバー」。
 * 渡したグループ id は、メンバーが 0 人でも必ずキーとして返す
 * （呼び出し側が「0 名」を描き分けられるように）。
 */
export async function loadGroupApprovers(
  groupIds: readonly number[],
  now: Date = new Date(),
): Promise<Map<number, GroupApprover[]>> {
  const result = new Map<number, GroupApprover[]>();
  const ids = [...new Set(groupIds)];
  if (ids.length === 0) return result;
  for (const id of ids) result.set(id, []);

  const members = await prisma.approvalGroupMember.findMany({
    where: { groupId: { in: ids }, ...effectiveMemberWhere(now) },
    include: { user: { select: { displayName: true, username: true } } },
    orderBy: { user: { username: "asc" } },
  });

  for (const m of members) {
    result.get(m.groupId)?.push({
      userId: m.userId,
      displayName: m.user.displayName,
      username: m.user.username,
    });
  }
  return result;
}
