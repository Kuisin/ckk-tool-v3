/**
 * approvals-data.ts — 承認・予定 (CM01) の承認セクションのデータソース
 * （旧 承認管理 PD03 の横断一覧）。
 *
 * PENDING の approval_requests を対象種別（注文請書 / 指示書 / 素材発注書 /
 * 購買依頼）横断で一覧する。
 *
 * 旧データ補完（依頼行のない承認待ちを行ワークフロー列から合成していた分岐）は
 * 廃止した — マイグレーション 20260908090000_approval_flows が進行中の全書類に
 * 実体の依頼行を作るため。
 */

import { appList } from "@/lib/app-list";
import { stepFromSnapshot } from "@/lib/approval-flow";
import { APPROVAL_TARGET, isApprovalTargetType } from "@/lib/approval-targets";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { localized } from "@/lib/format";

/** 承認管理 (PD03) の 1 行（client-safe）。 */
export interface ApprovalRequestRow {
  id: string;
  targetType: string; // work_orders | material_purchase_orders | order_acceptances | purchase_requests
  targetId: string; // 業務キー（ロット番号 int / PO-… / ORD-…）
  /** 表示用番号（指示書はロット番号 → 書類番号 WO-… へ解決済み）。 */
  targetDisplay: string;
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
  /**
   * 対象書類を開く READ 権限があるか。false = 開いても AccessDenied になる。
   * 遷移は止めず（承認そのものは別途 書類詳細で行う）、一覧にバッジを出して
   * 「押しても見られない」ことを先に知らせるためだけに使う。
   * 判定不能な未知の種別は true（根拠なく警告を出さない）。
   */
  canReadTarget: boolean;
}

/**
 * 対象種別ごとに「その書類を開けるか」を判定する（種別ごとに 1 回）。
 *
 * 判定は書類ページのゲート requireAppRead と**同じ経路**
 * （appList.requiredPermission → checkPermission(code, "READ")）を通す。
 * ここだけ独自に判定すると、バッジとゲートの答えが食い違って嘘をつく。
 *
 * checkPermission の権限集合はリクエスト単位でメモ化されている（lib/authz）
 * ため、種別が 4 つでも追加のクエリは発生しない。
 */
async function readableTargetTypes(
  targetTypes: Iterable<string>,
): Promise<Set<string>> {
  const readable = new Set<string>();
  await Promise.all(
    [...new Set(targetTypes)].map(async (targetType) => {
      if (!isApprovalTargetType(targetType)) return;
      const app = appList.find(
        (a) => a.key === APPROVAL_TARGET[targetType].appKey,
      );
      // 権限不要アプリ（requiredPermission === null）はログインだけで開ける。
      if (!app) return;
      if (app.requiredPermission === null) {
        readable.add(targetType);
        return;
      }
      const authz = await checkPermission(app.requiredPermission, "READ");
      if (authz.ok) readable.add(targetType);
    }),
  );
  return readable;
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

  const readable = await readableTargetTypes(requests.map((r) => r.targetType));

  // 指示書の target_id はロット番号（int 文字列）— 表示は書類番号へ解決する。
  const woNumbers = requests
    .filter((r) => r.targetType === "work_orders")
    .map((r) => Number(r.targetId))
    .filter((n) => Number.isInteger(n) && n >= 1);
  const woDocNumbers = new Map<string, string>(
    woNumbers.length
      ? (
          await prisma.workOrder.findMany({
            where: { workOrderNumber: { in: woNumbers } },
            select: { workOrderNumber: true, yearMonth: true, seq: true },
          })
        ).map((w) => [String(w.workOrderNumber), formatDocNumber("WOR", w)])
      : [],
  );

  return requests.map((r) => {
    const step = stepFromSnapshot(r.flowSnapshot, r.stepNo);
    const mode = r.mode as "ANY" | "ALL";
    return {
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      targetDisplay:
        r.targetType === "work_orders"
          ? (woDocNumbers.get(r.targetId) ?? `#${r.targetId}`)
          : r.targetId,
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
      canReadTarget:
        !isApprovalTargetType(r.targetType) || readable.has(r.targetType),
    };
  });
}
