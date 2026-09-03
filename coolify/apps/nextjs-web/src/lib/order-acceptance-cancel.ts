/**
 * order-acceptance-cancel.ts — 注文請書キャンセルの承認（保留 → 承認 → 適用）。
 *
 * 確定済み（COMPLETED）の注文請書は**明細単位ではキャンセルできない** —
 * キャンセルは注文請書ごと依頼し、承認設定（MS0B）の「注文請書キャンセル」
 * フローを通す。**1 段も無ければ素通し**（即適用 — 工程フロー変更と同じ規約）。
 *
 * 承認は**キャンセルを止める**: 依頼時点では何も変更せず、依頼行
 * （order_acceptance_cancel_requests）に保留して最終承認で初めて適用する。
 * 適用 = 全明細のキャンセル（予約解放 + 未着手指示書の連鎖キャンセル —
 * lib/order-line-cancel.ts）+ ヘッダの CANCELLED 遷移。差し戻しなら何も
 * 変わらない。承認依頼中の間に出荷された等で適用できなければ FAILED で残る
 * —— 黙って古い前提のまま当てない。
 */

import "server-only";

import { getTranslations } from "next-intl/server";
import { getApprovalFlow, startApprovalFlow } from "./approvals";
import { getCurrentActorId, recordAudit } from "./audit";
import { prisma } from "./db";
import { formatDocNumber } from "./doc-number";
import { cancelOrderLineTx } from "./order-line-cancel";

const TARGET_TYPE = "order_acceptance_cancel_requests" as const;

export interface AcceptanceCancelResult {
  ok: boolean;
  errors?: string[];
  /** true = 承認依頼中として保留した（まだ何も変わっていない）。 */
  pending?: boolean;
}

interface AcceptanceKey {
  yearMonth: string;
  seq: number;
}

/**
 * キャンセルできる状態か（依頼時 / 適用時に同じ検証を通す）。
 * 確定済み（COMPLETED）のみ・出荷済み（SHIPPED）の明細があれば不可。
 */
async function validateCancellable(
  key: AcceptanceKey,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tr = await getTranslations();
  const acceptance = await prisma.orderAcceptance.findUnique({
    where: { yearMonth_seq: key },
    select: {
      status: true,
      items: { select: { status: true, branch: true } },
    },
  });
  if (!acceptance)
    return { ok: false, error: tr("orderAcceptanceActions.targetNotFound") };
  if (acceptance.status !== "COMPLETED") {
    return {
      ok: false,
      error: tr("orderAcceptanceActions.onlyCompletedCanRequestCancel"),
    };
  }
  const shipped = acceptance.items.filter((i) => i.status === "SHIPPED").length;
  if (shipped > 0) {
    return {
      ok: false,
      error: tr("orderAcceptanceActions.cannotCancelShippedLines", {
        count: shipped,
      }),
    };
  }
  const active = acceptance.items.filter(
    (i) => i.status !== "CANCELLED",
  ).length;
  if (active === 0) {
    return {
      ok: false,
      error: tr("orderAcceptanceActions.allLinesAlreadyCancelled"),
    };
  }
  return { ok: true };
}

/**
 * キャンセル依頼の入口。承認が要るなら保留 + 承認依頼、承認設定が空なら即適用。
 * 呼び出し側（Server Action）は結果の `pending` を見て文言を変えるだけでよい。
 */
export async function submitAcceptanceCancelRequest(input: {
  key: AcceptanceKey;
  reason: string;
}): Promise<AcceptanceCancelResult> {
  const tr = await getTranslations();
  const { key } = input;
  const reason = input.reason.trim();
  if (!reason)
    return {
      ok: false,
      errors: [tr("common.enterAReasonForCancelling")],
    };

  const valid = await validateCancellable(key);
  if (!valid.ok) return { ok: false, errors: [valid.error] };

  const number = formatDocNumber("ORD", key);
  const flow = await getApprovalFlow(TARGET_TYPE);
  if (flow.length === 0) {
    // 承認設定が空 = 素通し（承認を運用しない環境で止めない）。
    return applyCancel(key, reason);
  }

  // 進行中の依頼は 1 注文請書に 1 件だけ（DB 側にも部分 unique index）。
  const existing = await prisma.orderAcceptanceCancelRequest.findFirst({
    where: {
      acceptanceYearMonth: key.yearMonth,
      acceptanceSeq: key.seq,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      errors: [tr("orderAcceptanceActions.cancelRequestAlreadyPending")],
    };
  }

  const actor = await getCurrentActorId();
  const row = await prisma.orderAcceptanceCancelRequest.create({
    data: {
      acceptanceYearMonth: key.yearMonth,
      acceptanceSeq: key.seq,
      reason,
      requestedBy: actor,
    },
    select: { id: true },
  });

  const started = await startApprovalFlow({
    targetType: TARGET_TYPE,
    targetId: row.id,
  });
  if (!started.ok) {
    // 依頼が作れないなら保留行も残さない（承認できない幽霊を作らない）。
    await prisma.orderAcceptanceCancelRequest.delete({ where: { id: row.id } });
    return {
      ok: false,
      errors: [started.error ?? tr("common.approvalRequestFailed")],
    };
  }

  await recordAudit({
    action: "UPDATE",
    tableName: "order_acceptances",
    recordId: number,
    after: {
      note: tr("orderAcceptanceActions.cancelRequestedNote", { reason }),
    },
  });
  return { ok: true, pending: true };
}

/**
 * 承認が完了した依頼を実際に当てる。承認依頼中の間に前提が変わっている
 * ことがあるので、適用前に依頼時と同じ検証を通す。
 */
export async function applyApprovedAcceptanceCancel(
  requestId: string,
): Promise<AcceptanceCancelResult> {
  const tr = await getTranslations();
  const row = await prisma.orderAcceptanceCancelRequest.findUnique({
    where: { id: requestId },
  });
  if (!row)
    return {
      ok: false,
      errors: [tr("orderAcceptanceActions.targetCancelRequestNotFound")],
    };
  if (row.status !== "PENDING") {
    return {
      ok: false,
      errors: [tr("orderAcceptanceActions.cancelRequestNotPending")],
    };
  }
  const key = { yearMonth: row.acceptanceYearMonth, seq: row.acceptanceSeq };
  const actor = await getCurrentActorId();
  const result = await applyCancel(key, row.reason);
  await prisma.orderAcceptanceCancelRequest.update({
    where: { id: row.id },
    data: {
      status: result.ok ? "APPLIED" : "FAILED",
      error: result.ok
        ? null
        : (result.errors?.join(" / ") ?? tr("common.applyFailed")),
      resolvedBy: actor,
      resolvedAt: new Date(),
    },
  });
  return result;
}

/** 差し戻し・取消で保留を閉じる（注文請書は変わらない）。 */
export async function closeAcceptanceCancelRequest(
  requestId: string,
  status: "REJECTED" | "CANCELLED",
): Promise<void> {
  const actor = await getCurrentActorId();
  await prisma.orderAcceptanceCancelRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status, resolvedBy: actor, resolvedAt: new Date() },
  });
}

export interface PendingAcceptanceCancelView {
  id: string;
  reason: string;
  requestedByName: string | null;
  requestedAt: string;
}

/** 注文請書の保留中のキャンセル依頼（無ければ null）。 */
export async function fetchPendingAcceptanceCancel(
  key: AcceptanceKey,
): Promise<PendingAcceptanceCancelView | null> {
  const row = await prisma.orderAcceptanceCancelRequest.findFirst({
    where: {
      acceptanceYearMonth: key.yearMonth,
      acceptanceSeq: key.seq,
      status: "PENDING",
    },
    include: { requestedByUser: { select: { displayName: true } } },
    orderBy: { requestedAt: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    reason: row.reason,
    requestedByName: row.requestedByUser?.displayName ?? null,
    requestedAt: row.requestedAt.toISOString(),
  };
}

/**
 * キャンセルの実体。依頼の有無に依らずここだけが書き換える。
 * 全明細のキャンセル + ヘッダ CANCELLED を単一 tx で行う。
 */
async function applyCancel(
  key: AcceptanceKey,
  reason: string,
): Promise<AcceptanceCancelResult> {
  const tr = await getTranslations();
  const valid = await validateCancellable(key);
  if (!valid.ok) return { ok: false, errors: [valid.error] };

  const number = formatDocNumber("ORD", key);
  const acceptance = await prisma.orderAcceptance.findUnique({
    where: { yearMonth_seq: key },
    select: {
      status: true,
      items: {
        select: { id: true, branch: true, status: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!acceptance)
    return {
      ok: false,
      errors: [tr("orderAcceptanceActions.targetNotFound")],
    };

  let summary: {
    cancelledLines: number;
    released: number;
    cancelledWos: number[];
  };
  try {
    summary = await prisma.$transaction(async (tx) => {
      let released = 0;
      const cancelledWos: number[] = [];
      let cancelledLines = 0;
      for (const line of acceptance.items) {
        if (line.status === "CANCELLED") continue;
        const r = await cancelOrderLineTx(
          tx,
          line.id,
          tr("orderAcceptanceActions.chainCancelNote", { number }),
        );
        if (!r.cancelled) {
          // 依頼〜適用の間に出荷された等 — tx ごと巻き戻す。
          throw new Error(
            `GUARD:${tr("orderAcceptanceActions.lineNotCancellableState", {
              branch: line.branch ?? "—",
            })}`,
          );
        }
        cancelledLines += 1;
        released += r.released;
        cancelledWos.push(...r.cancelledWos);
      }
      await tx.orderAcceptance.update({
        where: { yearMonth_seq: key },
        data: { status: "CANCELLED" },
      });
      return { cancelledLines, released, cancelledWos };
    });
  } catch (e) {
    const message =
      e instanceof Error && e.message.startsWith("GUARD:")
        ? e.message.slice("GUARD:".length)
        : tr("orderAcceptanceActions.cancelApplyFailed");
    return { ok: false, errors: [message] };
  }

  const woSuffix = summary.cancelledWos.length
    ? `（#${summary.cancelledWos.join(", #")}）`
    : "";
  await recordAudit({
    action: "UPDATE",
    tableName: "order_acceptances",
    recordId: number,
    before: { status: "COMPLETED" },
    after: {
      status: "CANCELLED",
      note: `${tr("orderAcceptanceActions.cancelAppliedNote", {
        reason,
        lines: summary.cancelledLines,
        released: summary.released,
        woCount: summary.cancelledWos.length,
      })}${woSuffix}`,
    },
  });
  return { ok: true, pending: false };
}
