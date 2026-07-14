/**
 * data.ts — 承認管理 (PD03) の横断データソース。
 *
 * PENDING の approval_requests を対象種別（指示書 / 素材発注書 / 受注請書）
 * 横断で一覧する。承認依頼行の正規化（§6 本実装）以前に承認待ちになった
 * 旧データ — 依頼行のない PENDING_1ST/2ND の指示書・REQUESTED の素材発注書 —
 * は行ワークフロー列から補完して合流させる（isLegacy = true、取りこぼし防止）。
 */

import { prisma } from "@/lib/db";

/** 承認管理 (PD03) の 1 行（client-safe）。 */
export interface ApprovalRequestRow {
  /** approval_requests.id（旧データ補完行は合成キー）。 */
  id: string;
  targetType: string; // work_orders | material_purchase_orders | order_acceptances
  targetId: string; // 業務キー（指示書番号 / PO-… / ORD-…）
  step: string; // FIRST | SECOND
  requestedBy: string; // displayName 解決済み
  requestedAt: string | null;
  notes: string | null;
  /** 依頼行のない旧データ（行ワークフロー列からの補完）。 */
  isLegacy: boolean;
}

/** 承認待ち一覧 (PD03) — PENDING の承認依頼 + 旧データ補完。依頼日時の昇順。 */
export async function fetchPendingApprovalRequests(): Promise<
  ApprovalRequestRow[]
> {
  const requests = await prisma.approvalRequest.findMany({
    where: { status: "PENDING" },
    include: { requestedByUser: { select: { displayName: true } } },
    orderBy: { requestedAt: "asc" },
  });

  const requestKeys = new Set(
    requests.map((r) => `${r.targetType}:${r.targetId}`),
  );

  // 旧データ補完 — 依頼行のない承認待ち指示書 / 承認依頼中の素材発注書。
  const [pendingWos, pendingPos] = await Promise.all([
    prisma.workOrder.findMany({
      where: { approvalStatus: { in: ["PENDING_1ST", "PENDING_2ND"] } },
      select: {
        workOrderNumber: true,
        approvalStatus: true,
        requested1stAt: true,
        requested1stBy: true,
      },
    }),
    prisma.materialPurchaseOrder.findMany({
      where: { status: "REQUESTED" },
      select: { poNumber: true, requestedAt: true, requestedBy: true },
    }),
  ]);
  const legacyWos = pendingWos.filter(
    (w) => !requestKeys.has(`work_orders:${w.workOrderNumber}`),
  );
  const legacyPos = pendingPos.filter(
    (p) => !requestKeys.has(`material_purchase_orders:${p.poNumber}`),
  );

  // 旧データの依頼者 uuid → displayName 解決
  const legacyUserIds = new Set<string>();
  for (const w of legacyWos)
    if (w.requested1stBy) legacyUserIds.add(w.requested1stBy);
  for (const p of legacyPos)
    if (p.requestedBy) legacyUserIds.add(p.requestedBy);
  const users = legacyUserIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...legacyUserIds] } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null) =>
    (id && users.find((u) => u.id === id)?.displayName) || "システム";

  const rows: ApprovalRequestRow[] = [
    ...requests.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      step: r.step as string,
      requestedBy: r.requestedByUser?.displayName ?? "システム",
      requestedAt: r.requestedAt.toISOString(),
      notes: r.notes,
      isLegacy: false,
    })),
    ...legacyWos.map((w) => ({
      id: `legacy-wo-${w.workOrderNumber}`,
      targetType: "work_orders",
      targetId: String(w.workOrderNumber),
      step: w.approvalStatus === "PENDING_1ST" ? "FIRST" : "SECOND",
      requestedBy: nameOf(w.requested1stBy),
      requestedAt: w.requested1stAt?.toISOString() ?? null,
      notes: null,
      isLegacy: true,
    })),
    ...legacyPos.map((p) => ({
      id: `legacy-po-${p.poNumber}`,
      targetType: "material_purchase_orders",
      targetId: p.poNumber,
      step: "FIRST",
      requestedBy: nameOf(p.requestedBy),
      requestedAt: p.requestedAt?.toISOString() ?? null,
      notes: null,
      isLegacy: true,
    })),
  ];

  return rows.sort((a, b) =>
    (a.requestedAt ?? "9999") < (b.requestedAt ?? "9999") ? -1 : 1,
  );
}
