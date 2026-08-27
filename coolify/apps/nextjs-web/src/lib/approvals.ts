/**
 * approvals.ts — N 段承認エンジン。server-only.
 *
 * 承認フローは書類種別ごとに 1 本（approval_flow_steps、承認設定 MS0B で編集）。
 * 依頼を出した時点で全段を approval_requests.flow_snapshot にコピーするので、
 * 進行中の書類はあとからフロー定義を編集されても当時の段数のまま進む。
 *
 * 1 書類につき PENDING の依頼は常に 1 行だけ（部分 unique index が保証）。
 * 段 N を閉じるのと段 N+1 を作るのは同一トランザクション。
 *
 * 承認できるかは 2 段構え:
 *   RBAC（checkPermission）— 呼び出し側の Server Action が行う門番
 *   グループ所属           — ここで判定する実ゲート（本人 or 期間内の代理）
 *
 * 判定そのもの（段が閉じるか・次は何段目か）は純ロジックの lib/approval-flow に
 * 置いてあり、画面と共用する。
 */

import type { Prisma } from "../../generated/client/client";
import {
  type ApprovalDocInfo,
  conditionsFromJson,
  type FlowCondition,
  matchFlowRule,
} from "./approval-conditions";
import {
  type ApprovalMode,
  type ApprovalPhase,
  decideAfterApproval,
  type FlowStepSnapshot,
  remainingApprovers,
  stepFromSnapshot,
  stepsFromSnapshot,
} from "./approval-flow";
import { effectiveMemberWhere } from "./approval-membership";
import { APPROVAL_TARGET, type ApprovalTargetType } from "./approval-targets";
import { getCurrentActorId } from "./audit";
import { prisma } from "./db";
import { parseDocKey } from "./doc-number";
import { type LocalizedText, localized } from "./format";
import { notify, notifyApprovalGroup } from "./notifications";

export type { ApprovalTargetType } from "./approval-targets";

// ─── 履歴 Json（行ワークフローの遷移記録。承認とは別軸で各書類が持つ） ──────

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

// ─── フロー定義の照会 ───────────────────────────────────────────────────────

export interface FlowStepDef {
  stepNo: number;
  name: LocalizedText;
  groupId: number;
  groupName: LocalizedText;
  mode: ApprovalMode;
}

/** 書類種別の承認フロー（stepNo 昇順）。未設定なら空配列。 */
export async function getApprovalFlow(
  targetType: ApprovalTargetType,
): Promise<FlowStepDef[]> {
  const rows = await prisma.approvalFlowStep.findMany({
    where: { targetType },
    include: { group: { select: { name: true } } },
    orderBy: { stepNo: "asc" },
  });
  return rows.map((r) => ({
    stepNo: r.stepNo,
    name: (r.name ?? { ja: "", en: "" }) as LocalizedText,
    groupId: r.groupId,
    groupName: (r.group.name ?? { ja: "", en: "" }) as LocalizedText,
    mode: r.mode as ApprovalMode,
  }));
}

/**
 * フォーム 1 件分の承認フロー（form_approval_steps）。
 *
 * targetId は回答番号なので、回答 → フォーム → 段定義 とたどる。段が 0 本なら
 * 「未設定」— 呼び出し側がその旨を返す。
 */
export async function getFormApprovalFlow(
  responseNumber: string,
): Promise<FlowStepDef[]> {
  const response = await prisma.formResponse.findUnique({
    where: { responseNumber },
    select: { formId: true },
  });
  if (!response) return [];
  return getFormApprovalFlowByFormId(response.formId);
}

/** フォーム id から直接引く（設定画面・依頼前の確認用）。 */
export async function getFormApprovalFlowByFormId(
  formId: string,
): Promise<FlowStepDef[]> {
  const rows = await prisma.formApprovalStep.findMany({
    where: { formId },
    include: { group: { select: { name: true } } },
    orderBy: { stepNo: "asc" },
  });
  return rows.map((r) => ({
    stepNo: r.stepNo,
    name: (r.name ?? { ja: "", en: "" }) as LocalizedText,
    groupId: r.groupId,
    groupName: (r.group.name ?? { ja: "", en: "" }) as LocalizedText,
    mode: r.mode as ApprovalMode,
  }));
}

/**
 * 承認フローの適用モード（approval_flows.apply_mode）。行が無ければ PRE
 * （= 承認後に適用・従来動作）。POST の意味は lib/flow-change-core.ts。
 */
export async function getApprovalApplyMode(
  targetType: ApprovalTargetType,
): Promise<string> {
  const row = await prisma.approvalFlow.findUnique({
    where: { targetType },
    select: { applyMode: true },
  });
  return row?.applyMode ?? "PRE";
}

/** 依頼を出す前の確認。未設定ならエラー文言、設定済みなら null。 */
export async function assertFlowConfigured(
  targetType: ApprovalTargetType,
): Promise<string | null> {
  // フォームはフォームごとにフローを持つので、種別だけでは判定できない
  // （呼ぶ側が assertFormFlowConfigured を使う）。
  if (targetType === "form_responses") return null;
  const count = await prisma.approvalFlowStep.count({ where: { targetType } });
  return count > 0
    ? null
    : `${APPROVAL_TARGET[targetType].label}の承認フローが未設定です（承認設定 MS0B で設定してください）`;
}

/**
 * その書類に承認が 1 つでも下りているか。
 *
 * 採番のリセットで番号が再利用されると、**前の書類の承認記録**を拾ってしまう
 * （target_id は業務キー文字列で FK が無い — 既知の性質）。書類の作成時刻より
 * 後の依頼だけを数えて、その取り違えを避ける。
 */
export async function hasAnyApproval(
  targetType: ApprovalTargetType,
  targetId: string,
  since: Date,
): Promise<boolean> {
  const count = await prisma.approvalRecord.count({
    where: {
      action: "APPROVED",
      request: { targetType, targetId, requestedAt: { gte: since } },
    },
  });
  return count > 0;
}

/** そのフォームに段が 1 つ以上あるか。無ければ画面に出す文言を返す。 */
export async function assertFormFlowConfigured(
  formId: string,
): Promise<string | null> {
  const count = await prisma.formApprovalStep.count({ where: { formId } });
  return count > 0
    ? null
    : "このフォームの承認フローが未設定です（フォームの「承認」タブで段を追加してください）";
}

// ─── 条件付きフロー（approval_flow_rules）────────────────────────────────────

/** 条件付きフローのルール 1 本（優先順・有効のみ返す）。 */
export interface FlowRuleDef {
  id: number;
  name: LocalizedText;
  priority: number;
  isActive: boolean;
  conditions: FlowCondition[];
  steps: FlowStepDef[];
}

/**
 * 書類種別の有効な条件付きフロー（priority 昇順）。段が 0 のルールは
 * 使いようがないので除く（保存時の検証でも防いでいる — 二重の安全網）。
 */
export async function getApprovalFlowRules(
  targetType: ApprovalTargetType,
): Promise<FlowRuleDef[]> {
  const rows = await prisma.approvalFlowRule.findMany({
    where: { targetType, isActive: true },
    include: {
      steps: {
        include: { group: { select: { name: true } } },
        orderBy: { stepNo: "asc" },
      },
    },
    orderBy: { priority: "asc" },
  });
  return rows
    .filter((r) => r.steps.length > 0)
    .map((r) => ({
      id: r.id,
      name: (r.name ?? { ja: "", en: "" }) as LocalizedText,
      priority: r.priority,
      isActive: r.isActive,
      conditions: conditionsFromJson(r.conditions),
      steps: r.steps.map((s) => ({
        stepNo: s.stepNo,
        name: (s.name ?? { ja: "", en: "" }) as LocalizedText,
        groupId: s.groupId,
        groupName: (s.group.name ?? { ja: "", en: "" }) as LocalizedText,
        mode: s.mode as ApprovalMode,
      })),
    }));
}

/**
 * 条件評価に使う書類の属性を抽出する。キーは
 * lib/approval-conditions.ts の APPROVAL_CONDITION_FIELDS と一致させること。
 * 書類が見つからない・読めないときは null（→ ルールは使わず既定フロー）。
 */
export async function fetchApprovalDocInfo(
  targetType: ApprovalTargetType,
  targetId: string,
): Promise<ApprovalDocInfo | null> {
  switch (targetType) {
    case "order_acceptances": {
      const key = parseDocKey(targetId, "ORD");
      if (!key) return null;
      const row = await prisma.orderAcceptance.findUnique({
        where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
        select: {
          deliveryMethod: true,
          assignedPlantId: true,
          items: {
            select: { quantity: true, unitPrice: true, amount: true },
          },
        },
      });
      if (!row) return null;
      // 確定前は amount が null なので quantity × unitPrice で補完。
      const totalAmount = row.items.reduce((sum, it) => {
        if (it.amount != null) return sum + Number(it.amount);
        if (it.unitPrice != null)
          return sum + it.quantity * Number(it.unitPrice);
        return sum;
      }, 0);
      return {
        total_amount: totalAmount,
        delivery_method: row.deliveryMethod,
        assigned_plant_id:
          row.assignedPlantId != null ? String(row.assignedPlantId) : null,
      };
    }
    case "work_orders": {
      const workOrderNumber = Number(targetId);
      if (!Number.isInteger(workOrderNumber)) return null;
      const row = await prisma.workOrder.findUnique({
        where: { workOrderNumber },
        select: { type: true, plannedQuantity: true },
      });
      if (!row) return null;
      return { type: row.type, planned_quantity: row.plannedQuantity };
    }
    case "material_purchase_orders": {
      const row = await prisma.materialPurchaseOrder.findUnique({
        where: { poNumber: targetId },
        select: { totalAmount: true },
      });
      if (!row) return null;
      return { total_amount: Number(row.totalAmount) };
    }
    case "purchase_requests": {
      const row = await prisma.purchaseRequest.findUnique({
        where: { requestNumber: targetId },
        select: { _count: { select: { items: true } } },
      });
      if (!row) return null;
      return { item_count: row._count.items };
    }
    case "form_responses": {
      const row = await prisma.formResponse.findUnique({
        where: { responseNumber: targetId },
        select: { form: { select: { kind: true } } },
      });
      if (!row) return null;
      return { form_kind: row.form.kind };
    }
    case "internal_pages": {
      const row = await prisma.internalPage.findUnique({
        where: { pageNumber: targetId },
        select: { pageNumber: true },
      });
      // 条件に使う属性は今のところ無い（APPROVAL_CONDITION_FIELDS も空）。
      // 書類が実在することだけを確かめて、空の属性を返す。
      return row ? {} : null;
    }
    case "work_order_flow_changes": {
      const row = await prisma.workOrderFlowChange.findUnique({
        where: { id: targetId },
        select: {
          workOrder: { select: { type: true, plannedQuantity: true } },
        },
      });
      if (!row) return null;
      return {
        wo_type: row.workOrder.type,
        wo_planned_quantity: row.workOrder.plannedQuantity,
      };
    }
    case "order_acceptance_cancel_requests": {
      const row = await prisma.orderAcceptanceCancelRequest.findUnique({
        where: { id: targetId },
        select: {
          acceptance: {
            select: {
              deliveryMethod: true,
              items: {
                select: { quantity: true, unitPrice: true, amount: true },
              },
            },
          },
        },
      });
      if (!row) return null;
      const totalAmount = row.acceptance.items.reduce((sum, it) => {
        if (it.amount != null) return sum + Number(it.amount);
        if (it.unitPrice != null)
          return sum + it.quantity * Number(it.unitPrice);
        return sum;
      }, 0);
      return {
        total_amount: totalAmount,
        delivery_method: row.acceptance.deliveryMethod,
      };
    }
  }
}

/**
 * 依頼時のフロー解決 — 条件付きフローが一致すればその段構成、なければ
 * 既定フロー。既定フローが未設定なら空配列（呼び出し側がエラーにする —
 * ルールは既定フローの**上書き**であり、単体では承認ゲートを作らない）。
 */
async function resolveFlowForTarget(
  targetType: ApprovalTargetType,
  targetId: string,
): Promise<FlowStepDef[]> {
  // フォームだけは**フォームごと**にフローを持つ（共通フローは見ない）。
  // 稟議・日報・点検簿が 1 本の承認を共有する理由が無いため、設定場所ごと
  // フォームの「承認」タブへ移してある。条件付きフロー（approval_flow_rules）
  // も使わない — 分岐が要るならフォームを分ければよい。
  if (targetType === "form_responses") return getFormApprovalFlow(targetId);

  const flow = await getApprovalFlow(targetType);
  if (flow.length === 0) return flow;
  const rules = await getApprovalFlowRules(targetType);
  if (rules.length === 0) return flow;
  const info = await fetchApprovalDocInfo(targetType, targetId);
  if (!info) return flow;
  const matched = matchFlowRule(rules, info);
  return matched ? matched.steps : flow;
}

/** フロー定義をスナップショット形に落とす。 */
function toSnapshot(flow: FlowStepDef[]): FlowStepSnapshot[] {
  return flow.map((s) => ({
    stepNo: s.stepNo,
    name: s.name,
    groupId: s.groupId,
    groupName: s.groupName,
    mode: s.mode,
  }));
}

// ─── 権限 ───────────────────────────────────────────────────────────────────

/**
 * actor がそのグループで承認できるか（本人が実効メンバー、または実効メンバーの
 * 期間内代理）。代理の場合は原承認者を返す — approval_records.delegate_for_id
 * に記録する。
 */
export async function resolveApprover(
  groupId: number | null | undefined,
  userId?: string | null,
): Promise<{ ok: boolean; delegateForId: string | null }> {
  const actor = userId ?? (await getCurrentActorId());
  if (!actor || groupId == null) return { ok: false, delegateForId: null };

  const now = new Date();
  const effective = effectiveMemberWhere(now);

  const direct = await prisma.approvalGroupMember.count({
    where: { groupId, userId: actor, group: { isActive: true }, ...effective },
  });
  if (direct > 0) return { ok: true, delegateForId: null };

  // 期間限定代理: 原承認者が今も実効メンバーであること
  const delegation = await prisma.approvalDelegate.findFirst({
    where: {
      groupId,
      delegateId: actor,
      validFrom: { lte: now },
      validUntil: { gte: now },
      group: { isActive: true },
      delegator: {
        approvalGroupMembers: {
          some: { groupId, group: { isActive: true }, ...effective },
        },
      },
    },
    select: { delegatorId: true },
  });
  if (delegation) return { ok: true, delegateForId: delegation.delegatorId };
  return { ok: false, delegateForId: null };
}

// ─── 画面向けの状態 ─────────────────────────────────────────────────────────

/**
 * 詳細画面の ActionCard / Stepper が必要とするものすべて。
 * 直列化可能な素の値だけ（Server Component から Client Component へ渡せる）。
 */
export interface ApprovalActionState {
  phase: ApprovalPhase;
  /** 現在の段（PENDING 以外は最後に進んでいた段）。 */
  stepNo: number;
  stepCount: number;
  stepLabel: string;
  groupLabel: string;
  mode: ApprovalMode;
  /** ログイン中のユーザーが今この段で承認・差し戻しできるか。 */
  canAct: boolean;
  /** ALL 段で、自分の枠は既に埋めたか。 */
  alreadyActed: boolean;
  /** ALL 段の未承認者（表示名）。 */
  remaining: { userId: string; name: string }[];
  /** フロー全段（Stepper 用）。 */
  steps: {
    stepNo: number;
    label: string;
    groupLabel: string;
    mode: ApprovalMode;
  }[];
}

const EMPTY_STATE: ApprovalActionState = {
  phase: "NONE",
  stepNo: 0,
  stepCount: 0,
  stepLabel: "",
  groupLabel: "",
  mode: "ANY",
  canAct: false,
  alreadyActed: false,
  remaining: [],
  steps: [],
};

function snapshotSteps(snapshot: unknown) {
  return stepsFromSnapshot(snapshot).map((s) => ({
    stepNo: s.stepNo,
    label: localized(s.name),
    groupLabel: localized(s.groupName),
    mode: s.mode,
  }));
}

// ─── 書類の世代スコープ ─────────────────────────────────────────────────────
//
// approval_requests は書類を **表示番号の文字列**（targetId）で指す。FK では
// ないので、書類が消えても依頼行は残る。採番をリセットして同じ番号が再利用
// されると、新しい書類が前の（削除済み）書類の承認記録を引き継いで見えて
// しまう（dev で実際に発生: 作成前の「第一承認」が新しい注文請書に出た）。
//
// 依頼は必ず書類より後に作られるので、「書類の作成日時より古い依頼」は
// 別世代のもの。読み取り時にそこで切る。

/** 対象書類の作成日時（見つからない・キーが解釈できない場合は null）。 */
async function targetCreatedAt(
  targetType: ApprovalTargetType,
  targetId: string,
): Promise<Date | null> {
  switch (targetType) {
    case "order_acceptances": {
      const key = parseDocKey(targetId, "ORD");
      if (!key) return null;
      const row = await prisma.orderAcceptance.findUnique({
        where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    }
    case "work_orders": {
      const workOrderNumber = Number(targetId);
      if (!Number.isInteger(workOrderNumber)) return null;
      const row = await prisma.workOrder.findUnique({
        where: { workOrderNumber },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    }
    case "material_purchase_orders": {
      const row = await prisma.materialPurchaseOrder.findUnique({
        where: { poNumber: targetId },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    }
    case "purchase_requests": {
      const row = await prisma.purchaseRequest.findUnique({
        where: { requestNumber: targetId },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    }
    case "form_responses": {
      const row = await prisma.formResponse.findUnique({
        where: { responseNumber: targetId },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    }
    case "internal_pages": {
      const row = await prisma.internalPage.findUnique({
        where: { pageNumber: targetId },
        select: { createdAt: true },
      });
      return row?.createdAt ?? null;
    }
    case "work_order_flow_changes": {
      // targetId は uuid（採番の再利用が無いので世代の混同は起きないが、
      // 判定の形は他書類とそろえておく）。
      const row = await prisma.workOrderFlowChange.findUnique({
        where: { id: targetId },
        select: { requestedAt: true },
      });
      return row?.requestedAt ?? null;
    }
    case "order_acceptance_cancel_requests": {
      const row = await prisma.orderAcceptanceCancelRequest.findUnique({
        where: { id: targetId },
        select: { requestedAt: true },
      });
      return row?.requestedAt ?? null;
    }
  }
}

/**
 * 「この書類の依頼」を選ぶ where 句。書類が引けなかったときは番号だけで
 * 絞る（従来どおり）— 絞り込みを増やすだけで、正常系の見え方は変わらない。
 */
async function targetScope(
  targetType: ApprovalTargetType,
  targetId: string,
): Promise<Prisma.ApprovalRequestWhereInput> {
  const createdAt = await targetCreatedAt(targetType, targetId);
  return createdAt
    ? { targetType, targetId, requestedAt: { gte: createdAt } }
    : { targetType, targetId };
}

/**
 * 対象の承認状態を組み立てる。PENDING の依頼が無ければ、最後に閉じた依頼
 * （承認済 / 差し戻し）から phase を決める。どちらも無ければ NONE。
 */
export async function fetchApprovalState(
  targetType: ApprovalTargetType,
  targetId: string,
  userId?: string | null,
): Promise<ApprovalActionState> {
  const actor = userId ?? (await getCurrentActorId());
  const scope = await targetScope(targetType, targetId);
  const pending = await prisma.approvalRequest.findFirst({
    where: { ...scope, status: "PENDING" },
    include: {
      approvers: {
        include: { user: { select: { displayName: true } } },
        orderBy: { userId: "asc" },
      },
    },
  });

  if (!pending) {
    // 閉じた依頼から局面を決める（最後の 1 件）
    const last = await prisma.approvalRequest.findFirst({
      where: scope,
      orderBy: [{ stepNo: "desc" }, { requestedAt: "desc" }],
    });
    if (!last) return EMPTY_STATE;
    const steps = snapshotSteps(last.flowSnapshot);
    const step = stepFromSnapshot(last.flowSnapshot, last.stepNo);
    return {
      ...EMPTY_STATE,
      phase: last.status === "REJECTED" ? "REJECTED" : "APPROVED",
      stepNo: last.stepNo,
      stepCount: last.stepCount,
      stepLabel: step ? localized(step.name) : "",
      groupLabel: step ? localized(step.groupName) : "",
      mode: last.mode as ApprovalMode,
      steps,
    };
  }

  const auth = await resolveApprover(pending.groupId, actor);
  const step = stepFromSnapshot(pending.flowSnapshot, pending.stepNo);
  const mode = pending.mode as ApprovalMode;
  // ALL は「自分（or 代理元）の枠が空いているか」まで見る
  const slotOwner = auth.delegateForId ?? actor;
  const mySlot = pending.approvers.find((a) => a.userId === slotOwner);
  const alreadyActed =
    mode === "ALL" && mySlot != null && mySlot.actedAt != null;
  const canAct =
    auth.ok && (mode === "ANY" || (mySlot != null && mySlot.actedAt == null));

  return {
    phase: "PENDING",
    stepNo: pending.stepNo,
    stepCount: pending.stepCount,
    stepLabel: step ? localized(step.name) : "",
    groupLabel: step ? localized(step.groupName) : "",
    mode,
    canAct,
    alreadyActed,
    remaining:
      mode === "ALL"
        ? pending.approvers
            .filter((a) => a.actedAt == null)
            .map((a) => ({ userId: a.userId, name: a.user.displayName }))
        : [],
    steps: snapshotSteps(pending.flowSnapshot),
  };
}

// ─── 遷移 ───────────────────────────────────────────────────────────────────

/** 依頼行 + その段の承認枠をトランザクション内で作る。 */
async function createStepRequest(
  tx: Prisma.TransactionClient,
  input: {
    targetType: ApprovalTargetType;
    targetId: string;
    stepNo: number;
    stepCount: number;
    snapshot: FlowStepSnapshot[];
    requestedBy: string | null;
    notes?: string;
  },
): Promise<{ id: string; groupId: number | null; mode: ApprovalMode }> {
  const step = input.snapshot.find((s) => s.stepNo === input.stepNo);
  const row = await tx.approvalRequest.create({
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      stepNo: input.stepNo,
      stepCount: input.stepCount,
      groupId: step?.groupId ?? null,
      mode: step?.mode ?? "ANY",
      flowSnapshot: input.snapshot as unknown as Prisma.InputJsonValue,
      requestedBy: input.requestedBy,
      notes: input.notes,
    },
    select: { id: true, groupId: true, mode: true },
  });
  // 依頼時点の実効メンバーを承認枠として張る。
  // ANY では表示・通知用、ALL では必須チェックリストになる。
  if (step) {
    const members = await tx.approvalGroupMember.findMany({
      where: {
        groupId: step.groupId,
        group: { isActive: true },
        ...effectiveMemberWhere(new Date()),
      },
      select: { userId: true },
    });
    if (members.length > 0) {
      await tx.approvalRequestApprover.createMany({
        data: members.map((m) => ({
          approvalRequestId: row.id,
          userId: m.userId,
        })),
        skipDuplicates: true,
      });
    }
  }
  return { ...row, mode: row.mode as ApprovalMode };
}

/** 承認者へ「承認してください」を送る（失敗しても業務処理は止めない）。 */
async function notifyStepStart(
  targetType: ApprovalTargetType,
  targetId: string,
  step: FlowStepSnapshot | undefined,
  requestId: string,
): Promise<void> {
  if (!step) return;
  try {
    // ALL 段はまだ押していない対象者だけに送る
    const userIds =
      step.mode === "ALL"
        ? (
            await prisma.approvalRequestApprover.findMany({
              where: { approvalRequestId: requestId, actedAt: null },
              select: { userId: true },
            })
          ).map((a) => a.userId)
        : undefined;
    await notifyApprovalGroup(step.groupId, {
      type: "APPROVAL_REQUEST",
      title: `${APPROVAL_TARGET[targetType].label} ${targetId} の${localized(step.name)}依頼`,
      // 承認管理の一覧ではなく当の書類を開く（承認操作は書類詳細の
      // ActionCard にある — design.md §10.9）。承認結果通知と同じ行き先。
      linkPath: APPROVAL_TARGET[targetType].href(targetId),
      userIds,
    });
  } catch (e) {
    console.error("[approvals] 承認依頼通知に失敗:", e);
  }
}

/**
 * 承認フローを開始する（1 段目の依頼を作る）。
 * 同一対象の PENDING が既にあれば何もしない（冪等 — 二重送信対策）。
 */
export async function startApprovalFlow(input: {
  targetType: ApprovalTargetType;
  targetId: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  // 条件付きフロー（approval_flow_rules）を書類の属性で解決する。
  // 一致すればその段構成、なければ既定フロー。以降は従来と同じ
  // （スナップショットに落ちるので、進行中の扱いに違いは無い）。
  const flow = await resolveFlowForTarget(input.targetType, input.targetId);
  if (flow.length === 0) {
    return {
      ok: false,
      error:
        input.targetType === "form_responses"
          ? "このフォームの承認フローが未設定です（フォームの「承認」タブで段を追加してください）"
          : `${APPROVAL_TARGET[input.targetType].label}の承認フローが未設定です（承認設定 MS0B で設定してください）`,
    };
  }
  const actor = await getCurrentActorId();
  const snapshot = toSnapshot(flow);

  // PENDING は番号ごとに 1 行（部分 unique index）。自分の世代のものなら
  // 二重依頼なので成功として返す。前の（削除済み）書類が残した行だった場合は
  // 作成が index で必ず落ちるので、黙って成功と言わずに理由を返す。
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      status: "PENDING",
    },
    select: { id: true, requestedAt: true },
  });
  if (existing) {
    const createdAt = await targetCreatedAt(input.targetType, input.targetId);
    if (!createdAt || existing.requestedAt >= createdAt) return { ok: true };
    return {
      ok: false,
      error: `${input.targetId} には削除済み書類の承認依頼が残っています（番号の再利用）。管理者に連絡してください`,
    };
  }

  let created: { id: string };
  try {
    created = await prisma.$transaction((tx) =>
      createStepRequest(tx, {
        targetType: input.targetType,
        targetId: input.targetId,
        stepNo: 1,
        stepCount: snapshot.length,
        snapshot,
        requestedBy: actor,
        notes: input.notes,
      }),
    );
  } catch (e) {
    // 同時依頼が部分 unique index（approval_requests_pending_unique）で衝突
    // → 相手の依頼が成立しているので成功として返す
    if ((e as { code?: string }).code === "P2002") return { ok: true };
    throw e;
  }

  await notifyStepStart(
    input.targetType,
    input.targetId,
    snapshot[0],
    created.id,
  );
  return { ok: true };
}

export interface ActOnStepResult {
  ok: boolean;
  error?: string;
  /** この段が閉じたか（ALL で枠が残ると false）。 */
  stepClosed: boolean;
  /** フロー全段が終わったか。 */
  flowCompleted: boolean;
  /** ALL 段の残り人数（閉じていれば 0）。 */
  remaining: number;
}

const ACT_FAILED = (error: string): ActOnStepResult => ({
  ok: false,
  error,
  stepClosed: false,
  flowCompleted: false,
  remaining: 0,
});

/**
 * 現在の段に対して承認 / 差し戻しを記録する。
 *
 * 差し戻しは 1 件で段を閉じる（モードに依らない）。承認は ANY なら 1 件、
 * ALL なら全枠が埋まったときに閉じる。段が閉じてまだ後続があれば、同じ
 * トランザクションで次段の依頼を作る — スナップショットは進行中の依頼から
 * 引き継ぐので、途中でフロー定義が変わっても影響されない。
 */
export async function actOnCurrentStep(input: {
  targetType: ApprovalTargetType;
  targetId: string;
  action: "APPROVED" | "REJECTED";
  comment?: string;
}): Promise<ActOnStepResult> {
  const actor = await getCurrentActorId();
  if (!actor) return ACT_FAILED("承認権限がありません");

  const request = await prisma.approvalRequest.findFirst({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      status: "PENDING",
    },
    include: { approvers: { select: { userId: true, actedAt: true } } },
  });
  if (!request) return ACT_FAILED("承認待ちの依頼がありません");

  const auth = await resolveApprover(request.groupId, actor);
  if (!auth.ok) {
    return ACT_FAILED("承認権限がありません（代理設定も未該当）");
  }
  const mode = request.mode as ApprovalMode;
  const slotOwner = auth.delegateForId ?? actor;
  const snapshot = stepsFromSnapshot(request.flowSnapshot);
  const stepCount = request.stepCount;

  // ALL は自分の枠が空いていることが前提
  if (mode === "ALL" && input.action === "APPROVED") {
    const mySlot = request.approvers.find((a) => a.userId === slotOwner);
    if (!mySlot) {
      return ACT_FAILED("この段の承認対象者ではありません");
    }
    if (mySlot.actedAt != null) {
      return ACT_FAILED("この段はすでに承認済みです");
    }
  }

  const outcome = await prisma.$transaction(async (tx) => {
    if (input.action === "REJECTED") {
      // 差し戻しは段を即座に閉じる。条件付き更新で同時実行を 1 件に絞る。
      const res = await tx.approvalRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "REJECTED" },
      });
      if (res.count !== 1) return null;
      await tx.approvalRecord.create({
        data: {
          approvalRequestId: request.id,
          approverId: actor,
          delegateForId: auth.delegateForId,
          action: "REJECTED",
          comment: input.comment,
        },
      });
      await tx.approvalRequestApprover.updateMany({
        where: { approvalRequestId: request.id, userId: slotOwner },
        data: { actedAt: new Date(), actedBy: actor },
      });
      return { stepClosed: true, flowCompleted: false, remaining: 0 };
    }

    // ── 承認 ──
    if (mode === "ALL") {
      // 枠を 1 つだけ claim（同時押しはどちらか一方だけが成立）
      const claimed = await tx.approvalRequestApprover.updateMany({
        where: {
          approvalRequestId: request.id,
          userId: slotOwner,
          actedAt: null,
        },
        data: { actedAt: new Date(), actedBy: actor },
      });
      if (claimed.count !== 1) return null;
    } else {
      // ANY は依頼行そのものを claim
      const res = await tx.approvalRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "APPROVED" },
      });
      if (res.count !== 1) return null;
      await tx.approvalRequestApprover.updateMany({
        where: { approvalRequestId: request.id, userId: slotOwner },
        data: { actedAt: new Date(), actedBy: actor },
      });
    }

    await tx.approvalRecord.create({
      data: {
        approvalRequestId: request.id,
        approverId: actor,
        delegateForId: auth.delegateForId,
        action: "APPROVED",
        comment: input.comment,
      },
    });

    // トランザクション内で枠を読み直して判定する
    const slots = await tx.approvalRequestApprover.findMany({
      where: { approvalRequestId: request.id },
      select: { userId: true, actedAt: true },
    });
    const decision = decideAfterApproval({
      mode,
      required: slots,
      stepNo: request.stepNo,
      stepCount,
    });

    if (mode === "ALL" && decision.stepClosed) {
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED" },
      });
    }

    let nextRequestId: string | null = null;
    if (decision.nextStepNo != null) {
      const next = await createStepRequest(tx, {
        targetType: input.targetType,
        targetId: input.targetId,
        stepNo: decision.nextStepNo,
        stepCount,
        snapshot,
        requestedBy: request.requestedBy,
      });
      nextRequestId = next.id;
    }

    return {
      stepClosed: decision.stepClosed,
      flowCompleted: decision.flowCompleted,
      remaining: decision.stepClosed ? 0 : remainingApprovers(slots).length,
      nextStepNo: decision.nextStepNo,
      nextRequestId,
    };
  });

  if (!outcome) return ACT_FAILED("この依頼は既に処理されています");

  // ── 通知（tx 外・ベストエフォート） ──
  const nextStepNo = "nextStepNo" in outcome ? outcome.nextStepNo : null;
  const nextRequestId =
    "nextRequestId" in outcome ? outcome.nextRequestId : null;
  if (nextStepNo != null && nextRequestId) {
    await notifyStepStart(
      input.targetType,
      input.targetId,
      snapshot.find((s) => s.stepNo === nextStepNo),
      nextRequestId,
    );
  }
  // 依頼者へ結果を伝えるのは、フローが終わった / 差し戻された ときだけ。
  // 途中の段まで一々知らせると通知が埋まる。
  const finished = input.action === "REJECTED" || outcome.flowCompleted;
  if (finished && request.requestedBy && request.requestedBy !== actor) {
    try {
      await notify({
        userIds: [request.requestedBy],
        type: "APPROVAL_RESULT",
        title: `${APPROVAL_TARGET[input.targetType].label} ${input.targetId} が${
          input.action === "APPROVED" ? "承認されました" : "差し戻されました"
        }`,
        message: input.comment ?? undefined,
        linkPath: APPROVAL_TARGET[input.targetType].href(input.targetId),
      });
    } catch (e) {
      console.error("[approvals] 承認結果通知に失敗:", e);
    }
  }

  return {
    ok: true,
    stepClosed: outcome.stepClosed,
    flowCompleted: outcome.flowCompleted,
    remaining: outcome.remaining,
  };
}

/** 進行中の承認を取り下げる（書類のキャンセル時）。承認枠は cascade で消える。 */
export async function cancelApprovalFlow(input: {
  targetType: ApprovalTargetType;
  targetId: string;
}): Promise<void> {
  await prisma.approvalRequest.deleteMany({
    where: {
      targetType: input.targetType,
      targetId: input.targetId,
      status: "PENDING",
    },
  });
}

// ─── 履歴表示 ───────────────────────────────────────────────────────────────

export interface ApprovalTrailEntry {
  stepNo: number;
  stepLabel: string;
  status: string;
  mode: ApprovalMode;
  requestedAt: string;
  /** ALL 段の進捗（ANY 段は null）。 */
  progress: { approved: number; required: number } | null;
  records: {
    approver: string;
    delegateFor: string | null;
    action: string;
    comment: string | null;
    actedAt: string;
  }[];
}

/** 対象の承認記録（依頼 + 記録、承認者名解決済み）を段の昇順で取得。 */
export async function fetchApprovalTrail(
  targetType: ApprovalTargetType,
  targetId: string,
): Promise<ApprovalTrailEntry[]> {
  const rows = await prisma.approvalRequest.findMany({
    where: await targetScope(targetType, targetId),
    include: {
      approvers: { select: { actedAt: true } },
      records: {
        include: {
          approver: { select: { displayName: true } },
          delegateFor: { select: { displayName: true } },
        },
        orderBy: { actedAt: "asc" },
      },
    },
    orderBy: [{ stepNo: "asc" }, { requestedAt: "asc" }],
  });
  return rows.map((r) => {
    const step = stepFromSnapshot(r.flowSnapshot, r.stepNo);
    const mode = r.mode as ApprovalMode;
    return {
      stepNo: r.stepNo,
      stepLabel: step ? localized(step.name) : `${r.stepNo} 段目`,
      status: r.status,
      mode,
      requestedAt: r.requestedAt.toISOString(),
      progress:
        mode === "ALL"
          ? {
              approved: r.approvers.filter((a) => a.actedAt != null).length,
              required: r.approvers.length,
            }
          : null,
      records: r.records.map((rec) => ({
        approver: rec.approver.displayName,
        delegateFor: rec.delegateFor?.displayName ?? null,
        action: rec.action,
        comment: rec.comment,
        actedAt: rec.actedAt.toISOString(),
      })),
    };
  });
}

/** 書類種別の 1 段目の承認グループ（フロー外からの通知宛先に使う）。 */
export async function firstStepGroupId(
  targetType: ApprovalTargetType,
): Promise<number | null> {
  const row = await prisma.approvalFlowStep.findFirst({
    where: { targetType },
    orderBy: { stepNo: "asc" },
    select: { groupId: true },
  });
  return row?.groupId ?? null;
}
