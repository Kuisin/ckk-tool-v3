/**
 * inspection-approval.ts — 検査承認工程（is_approval_step）の読み取り + 承認。
 * server-only.
 *
 * nextjs-web の approveInspectionRecord（work-orders/[id]/steps/[stepId]/
 * actions.ts）と同じ業務規則のキオスク版。**PR #272 の時点では意図的に web
 * だけに残していた**が、検査記録・検査表確認・最終検査が共有端末で回せるように
 * なったあとも承認だけ web に残るのは、現場が 1 台のタブレットで完結できない
 * 唯一の穴だったので移した。
 *
 * 承認できる人の判定は 3 段（web と同じ順序・同じ条件）:
 *   1. 検査表に承認グループの指定がある → そのグループの**実効メンバー**か、
 *      期間限定の代理人であること
 *   2. グループ指定は無いが承認者が名指しされている → その中に居ること
 *   3. どちらも無い → 検査記録を読める人なら誰でも（＝工程の担当者）
 *
 * ★ **合格（PASS）の記録だけ承認できる。** 不合格を承認できてしまうと
 *   「承認済み」が品質の保証にならなくなる。
 */

import { recordAudit } from "./audit";
import { prisma } from "./db";
import type { LocalizedText } from "./format";
import { localized } from "./format";
import type { Locale } from "./i18n";
import { inspectionValueLabel } from "./inspection-value-label";
import { encodeInventoryNote } from "./inventory-note-core";
import type { StepActionResult, StepErrorCode } from "./step-execution";

const fail = (code: StepErrorCode, ...errors: string[]): StepActionResult => ({
  ok: false,
  codes: [code],
  errors: errors.length > 0 ? errors : undefined,
});

/**
 * 「いまこの瞬間、実効なメンバーか」の Prisma where 断片。
 *
 * 原本は nextjs-web `lib/approval-membership.ts` の `effectiveMemberWhere`。
 * あちらは i18n（messages）に依存していてキオスクへそのまま持ち込めないため、
 * **この 1 関数だけを写している**（twin file にはしない）。条件を変えるときは
 * 必ず両方を直すこと — 片方だけ緩めると、画面では承認者に見える人が押せない
 * （またはその逆）という食い違いになる。
 *
 * 常任 = valid_from / valid_until とも null。期間限定 = 両方に日時（片側だけは
 * DB の CHECK が禁止）。端は両端とも含む。
 */
function effectiveMemberWhere(now: Date) {
  return {
    isActive: true,
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
    ],
  };
}

/** 検査表 1 行ぶんの記入内容（承認する人が中身を確かめるために出す）。 */
export interface ApprovableInspectionItem {
  itemName: string;
  /** 実測値の表示文字列（複数サンプルは " / " 連結。未入力は null）。 */
  valueLabel: string | null;
  isPass: boolean | null;
}

/** 承認画面に出す検査記録 1 件。 */
export interface ApprovableInspectionRecord {
  id: string;
  /** 記録元の工程名（指示書横断で並べるので、どの工程の検査かを出す）。 */
  stepName: string;
  templateName: string;
  /**
   * 記入済みの検査表の中身。**承認は「見てから押す」もの**なので、
   * 何を承認するのか分からないまま印だけ押せる画面にしない。
   */
  items: ApprovableInspectionItem[];
  status: string;
  recordedAt: string | null;
  recordedByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  /** この人がこの記録を承認できるか（PASS かつ承認者条件を満たす）。 */
  canApprove: boolean;
}

/**
 * 承認できる人か（グループ / 名指し / 制限なし）。
 * 記録ごとに検査表の設定が違い得るので、記録ごとに解く。
 */
async function canActorApprove(
  approvalGroupId: number | null,
  approverIds: readonly string[],
  actorId: string,
): Promise<boolean> {
  if (approvalGroupId != null) {
    const now = new Date();
    const direct = await prisma.approvalGroupMember.count({
      where: {
        groupId: approvalGroupId,
        userId: actorId,
        group: { isActive: true },
        ...effectiveMemberWhere(now),
      },
    });
    if (direct > 0) return true;
    // 期間限定代理 — 原承認者が今も実効メンバーであること（web と同条件）。
    const delegated = await prisma.approvalDelegate.count({
      where: {
        groupId: approvalGroupId,
        delegateId: actorId,
        validFrom: { lte: now },
        validUntil: { gte: now },
        group: { isActive: true },
        delegator: {
          approvalGroupMembers: {
            some: {
              groupId: approvalGroupId,
              group: { isActive: true },
              ...effectiveMemberWhere(now),
            },
          },
        },
      },
    });
    return delegated > 0;
  }
  if (approverIds.length > 0) return approverIds.includes(actorId);
  return true; // 制限なし
}

/**
 * 検査承認工程で承認対象になる記録（**指示書全体**の検査記録）。
 * 承認は「この指示書の検査がひととおり終わったか」を見る仕事なので、
 * 自分の工程の記録だけでは足りない（web の InspectionApprovalPanel と同じ）。
 */
export async function getWorkOrderInspectionRecords(
  stepId: string,
  actorId: string,
  locale: Locale,
): Promise<ApprovableInspectionRecord[]> {
  const step = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    select: { workOrderId: true },
  });
  if (!step) return [];

  const records = await prisma.inspectionRecord.findMany({
    where: { step: { workOrderId: step.workOrderId } },
    include: {
      template: {
        select: {
          name: true,
          approvalGroupId: true,
          approvers: { select: { userId: true } },
        },
      },
      step: { include: { processStep: { select: { name: true } } } },
      // 承認する人が中身を確かめられるように、記入済みの行も渡す。
      items: { include: { templateItem: true } },
    },
    orderBy: { recordedAt: "desc" },
  });
  const valueLabel = inspectionValueLabel(locale);

  const userIds = [
    ...new Set(
      records
        .flatMap((r) => [r.recordedBy, r.approvedBy])
        .filter((id): id is string => id != null),
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null) =>
    id ? (users.find((u) => u.id === id)?.displayName ?? null) : null;

  return Promise.all(
    records.map(async (r) => ({
      id: r.id,
      stepName: localized(
        r.step.processStep.name as LocalizedText | null,
        locale,
      ),
      templateName: localized(r.template.name as LocalizedText | null, locale),
      items: r.items.map((it) => ({
        itemName: localized(
          it.templateItem.itemName as LocalizedText | null,
          locale,
        ),
        valueLabel: valueLabel(it),
        isPass: it.isPass,
      })),
      status: r.status,
      recordedAt: r.recordedAt?.toISOString() ?? null,
      recordedByName: nameOf(r.recordedBy),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      approvedByName: nameOf(r.approvedBy),
      canApprove:
        r.status === "PASS" &&
        (await canActorApprove(
          r.template.approvalGroupId,
          r.template.approvers.map((a) => a.userId),
          actorId,
        )),
    })),
  );
}

/**
 * 検査記録の承認（PASS → APPROVED）。
 * 承認工程が進行中で、ロックが null か自分であること — 他の記録系と同条件。
 */
export async function approveInspectionRecord(
  stepId: string,
  actorId: string,
  recordId: string,
): Promise<StepActionResult> {
  const step = await prisma.workOrderStep.findUnique({
    where: { id: stepId },
    select: {
      status: true,
      sessionLockedBy: true,
      workOrderId: true,
      workOrder: { select: { workOrderNumber: true } },
      processStep: { select: { isApprovalStep: true } },
    },
  });
  if (!step) return fail("NOT_FOUND");
  if (!step.processStep.isApprovalStep) return fail("TEMPLATE_INVALID");
  if (step.status !== "IN_PROGRESS") return fail("NOT_IN_PROGRESS");
  if (step.sessionLockedBy && step.sessionLockedBy !== actorId) {
    return fail("LOCK_HELD_BY_OTHER");
  }

  // 同じ指示書の記録であること（別の指示書の記録に承認印は押させない）。
  const record = await prisma.inspectionRecord.findFirst({
    where: { id: recordId, step: { workOrderId: step.workOrderId } },
    include: {
      template: {
        select: {
          approvalGroupId: true,
          approvers: { select: { userId: true } },
        },
      },
    },
  });
  if (!record) return fail("NOT_FOUND");
  if (record.status !== "PASS") return fail("INSPECTION_NOT_PASS");
  const allowed = await canActorApprove(
    record.template.approvalGroupId,
    record.template.approvers.map((a) => a.userId),
    actorId,
  );
  if (!allowed) return fail("NOT_APPROVER");

  await prisma.inspectionRecord.update({
    where: { id: recordId },
    data: { status: "APPROVED", approvedBy: actorId, approvedAt: new Date() },
  });
  await recordAudit({
    action: "UPDATE",
    tableName: "work_orders",
    recordId: String(step.workOrder.workOrderNumber),
    after: { note: encodeInventoryNote("inspectionApproved") },
  });
  return { ok: true };
}
