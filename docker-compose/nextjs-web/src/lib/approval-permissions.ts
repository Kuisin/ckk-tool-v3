import "server-only";

/**
 * approval-permissions.ts — 「この人はこの書類の承認を押せるのか」を
 * 権限（RBAC）側から見る。承認設定 (MS0B) の表示専用。
 *
 * 承認が通らない相談は、たいてい次のどれかで止まっている:
 *   ① 権限     — `<code>:APPROVE` を持っていない（ここで見るのはこれ）
 *   ② 所属     — 承認グループのメンバーでない / 期間外（approval-membership.ts）
 *   ③ スコープ — 権限が拠点限定で、その書類の拠点が範囲外（*InScope）
 *
 * ①は設定画面で先に潰せるのに、これまでは SY01 のユーザー詳細を 1 人ずつ
 * 開かないと分からなかった。ここでまとめて引き、承認グループの各メンバーに
 * 突き合わせる。
 *
 * 判定規則は @ckk/authz-core の decide() と同じ（食い違うと画面が嘘をつく）:
 *   一致 = (code, APPROVE) or (code, ADMIN) or (system, ADMIN)
 *   ALL の一致行が 1 つでもあれば全社 — なければ拠点等に限定される。
 * スコープの実効解決（所属拠点との交差）は書類が決まらないとできないので、
 * ここでは「全社か、限定か」までを返す。
 */

import { SUPERUSER_ACTION, SUPERUSER_CODE } from "@ckk/authz-core";
import { effectiveMemberWhere } from "./approval-membership";
import { prisma } from "./db";

/** user_permissions ビューの 1 行（承認判定に要る列だけ）。 */
export interface ApprovePermissionRow {
  code: string;
  action: string;
  scope: string;
}

export interface ApproveCapability {
  /** `code:APPROVE` を持つか（code:ADMIN・system:ADMIN を内包）。 */
  allowed: boolean;
  /** 全社スコープ — どの書類でも押せる。false = 拠点等に限定。 */
  unrestricted: boolean;
  /** 限定スコープの内訳（PLANT / OWN …）。unrestricted のときは空。 */
  scopes: string[];
}

export const NO_APPROVE_CAPABILITY: ApproveCapability = {
  allowed: false,
  unrestricted: false,
  scopes: [],
};

/** 1 ユーザーぶんの grant 行 → その権限コードの承認可否（純ロジック）。 */
export function buildApproveCapability(
  rows: readonly ApprovePermissionRow[],
  code: string,
): ApproveCapability {
  const superuser = rows.some(
    (r) => r.code === SUPERUSER_CODE && r.action === SUPERUSER_ACTION,
  );
  if (superuser) return { allowed: true, unrestricted: true, scopes: [] };

  const matching = rows.filter(
    (r) => r.code === code && (r.action === "APPROVE" || r.action === "ADMIN"),
  );
  if (matching.length === 0) return NO_APPROVE_CAPABILITY;
  if (matching.some((r) => r.scope === "ALL")) {
    return { allowed: true, unrestricted: true, scopes: [] };
  }
  return {
    allowed: true,
    unrestricted: false,
    scopes: [...new Set(matching.map((r) => r.scope))].sort(),
  };
}

/**
 * 指定ユーザーの、指定権限コードごとの承認可否をまとめて引く（1 クエリ）。
 * 返り値は userId → code → capability。行が無いユーザーも allowed:false で埋める。
 */
export async function loadApproveCapabilities(
  userIds: readonly string[],
  codes: readonly string[],
): Promise<Map<string, Map<string, ApproveCapability>>> {
  const result = new Map<string, Map<string, ApproveCapability>>();
  const ids = [...new Set(userIds)];
  const wanted = [...new Set(codes)];
  if (ids.length === 0 || wanted.length === 0) return result;

  // ADMIN も引く（code:ADMIN は APPROVE を内包し、system:ADMIN は全コードを内包）。
  const rows = await prisma.$queryRaw<
    {
      user_id: string;
      permission_code: string;
      action: string;
      scope: string;
    }[]
  >`
    SELECT user_id::text AS user_id, permission_code, action::text AS action,
           scope::text AS scope
      FROM app.user_permissions
     WHERE user_id = ANY(${ids}::uuid[])
       AND action::text IN ('APPROVE', 'ADMIN')
  `;

  const byUser = new Map<string, ApprovePermissionRow[]>();
  for (const r of rows) {
    const row = { code: r.permission_code, action: r.action, scope: r.scope };
    const list = byUser.get(r.user_id);
    if (list) list.push(row);
    else byUser.set(r.user_id, [row]);
  }

  for (const id of ids) {
    const userRows = byUser.get(id) ?? [];
    const perCode = new Map<string, ApproveCapability>();
    for (const code of wanted) {
      perCode.set(code, buildApproveCapability(userRows, code));
    }
    result.set(id, perCode);
  }
  return result;
}

/** 承認グループの実効メンバー 1 人ぶん（権限コードごとの承認可否つき）。 */
export interface GroupApprover {
  userId: string;
  displayName: string;
  username: string;
  /** 権限コード → 承認可否（loadGroupApprovers に渡したコードぶんだけ入る）。 */
  capabilities: Record<string, ApproveCapability>;
}

/**
 * 承認グループの「今この瞬間に承認できるメンバー」+ その承認権限。
 *
 * 期間外・無効のメンバーはそもそも押せないので除く（approval-membership の
 * effectiveMemberWhere = isMemberEffective と同じ条件）。代理（approval_delegates）
 * は本来の承認者の代わりに押す別の軸なのでここには出さない。
 */
export async function loadGroupApprovers(
  groupIds: readonly number[],
  codes: readonly string[],
  now: Date = new Date(),
): Promise<Map<number, GroupApprover[]>> {
  const result = new Map<number, GroupApprover[]>();
  const ids = [...new Set(groupIds)];
  if (ids.length === 0) return result;

  const members = await prisma.approvalGroupMember.findMany({
    where: { groupId: { in: ids }, ...effectiveMemberWhere(now) },
    include: { user: { select: { displayName: true, username: true } } },
    orderBy: { user: { username: "asc" } },
  });

  const capabilities = await loadApproveCapabilities(
    members.map((m) => m.userId),
    codes,
  );

  for (const id of ids) result.set(id, []);
  for (const m of members) {
    const perCode = capabilities.get(m.userId);
    const capabilityRecord: Record<string, ApproveCapability> = {};
    for (const code of codes) {
      capabilityRecord[code] = perCode?.get(code) ?? NO_APPROVE_CAPABILITY;
    }
    result.get(m.groupId)?.push({
      userId: m.userId,
      displayName: m.user.displayName,
      username: m.user.username,
      capabilities: capabilityRecord,
    });
  }
  return result;
}
