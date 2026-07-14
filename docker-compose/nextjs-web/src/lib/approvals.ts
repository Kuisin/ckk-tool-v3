/**
 * approvals.ts — 指示書承認の共通ヘルパ。server-only.
 *
 * §6 の簡易版: 承認可否は approval_group_members のメンバーシップで判定し、
 * 遷移は work_orders の列 + history Json（MaterialPurchaseOrder と同型）に
 * 記録する。代理・承認依頼レコードは §6 本実装時に拡張。
 */

import type { ApprovalGroupType } from "../../generated/client/client";
import { getCurrentActorId } from "./audit";
import { prisma } from "./db";

/** actor が type の有効な承認グループのメンバーか。 */
export async function isApprover(
  type: ApprovalGroupType,
  userId?: string | null,
): Promise<boolean> {
  const actor = userId ?? (await getCurrentActorId());
  if (!actor) return false;
  const count = await prisma.approvalGroupMember.count({
    where: {
      userId: actor,
      isActive: true,
      group: { type, isActive: true },
    },
  });
  return count > 0;
}

export interface HistoryEntry {
  action: string;
  user: string | null;
  at: string; // ISO
  notes?: string;
}

/** history Json 配列への追記（不正形は作り直す）。 */
export function appendHistory(
  history: unknown,
  entry: HistoryEntry,
): HistoryEntry[] {
  const list = Array.isArray(history) ? (history as HistoryEntry[]) : [];
  return [...list, entry];
}
