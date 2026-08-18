/**
 * data.ts — 承認管理 (PD03) の横断データソース。
 *
 * PENDING の approval_requests を対象種別（注文請書 / 指示書 / 素材発注書 /
 * 購買依頼）横断で一覧する。
 *
 * 旧データ補完（依頼行のない承認待ちを行ワークフロー列から合成していた分岐）は
 * 廃止した — マイグレーション 20260908090000_approval_flows が進行中の全書類に
 * 実体の依頼行を作るため。
 */

import { stepFromSnapshot } from "@/lib/approval-flow";
import { prisma } from "@/lib/db";
import { localized } from "@/lib/format";

/** 承認管理 (PD03) の 1 行（client-safe）。 */
export interface ApprovalRequestRow {
  id: string;
  targetType: string; // work_orders | material_purchase_orders | order_acceptances | purchase_requests
  targetId: string; // 業務キー（指示書番号 / PO-… / ORD-…）
  /** 何段目か（1 起点）と総段数 — 「2/3」と出す。 */
  stepNo: number;
  stepCount: number;
  /** 段の名称（依頼時点のスナップショット由来）。 */
  stepLabel: string;
  mode: "ANY" | "ALL";
  /** ALL 段の進捗。ANY 段は required=0。 */
  approvedCount: number;
  requiredCount: number;
  requestedBy: string; // displayName 解決済み
  requestedAt: string | null;
  notes: string | null;
}

/** 承認待ち一覧 (PD03) — PENDING の承認依頼。依頼日時の昇順。 */
export async function fetchPendingApprovalRequests(): Promise<
  ApprovalRequestRow[]
> {
  const requests = await prisma.approvalRequest.findMany({
    where: { status: "PENDING" },
    include: {
      requestedByUser: { select: { displayName: true } },
      approvers: { select: { actedAt: true } },
    },
    orderBy: { requestedAt: "asc" },
  });

  return requests.map((r) => {
    const step = stepFromSnapshot(r.flowSnapshot, r.stepNo);
    const mode = r.mode as "ANY" | "ALL";
    return {
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      stepNo: r.stepNo,
      stepCount: r.stepCount,
      stepLabel: step ? localized(step.name) : `${r.stepNo} 段目`,
      mode,
      approvedCount:
        mode === "ALL"
          ? r.approvers.filter((a) => a.actedAt != null).length
          : 0,
      requiredCount: mode === "ALL" ? r.approvers.length : 0,
      requestedBy: r.requestedByUser?.displayName ?? "システム",
      requestedAt: r.requestedAt.toISOString(),
      notes: r.notes,
    };
  });
}
