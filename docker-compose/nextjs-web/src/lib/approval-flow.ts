/**
 * approval-flow.ts — N 段承認の純ロジック。
 *
 * 承認フローは書類種別ごとに 1 本（approval_flow_steps）。依頼を出した時点で
 * 全段を approval_requests.flow_snapshot にコピーするので、進行中の書類は
 * あとからフロー定義を編集されても当時の段数のまま進む。
 *
 * このファイルは I/O を持たない。「1 件承認したらこの段は閉じるか」「次は
 * 何段目か」を決めるのはここだけで、サーバー（lib/approvals.ts）も画面
 * （components/approvals/*）も同じ関数を通す。
 */

import type { LocalizedText } from "./format";

/** 段の成立条件。ANY = 誰か 1 名 / ALL = 対象メンバー全員。 */
export type ApprovalMode = "ANY" | "ALL";

/** 承認フローの 1 段（依頼時にスナップショットされる形）。 */
export interface FlowStepSnapshot {
  stepNo: number;
  name: LocalizedText;
  groupId: number;
  groupName: LocalizedText;
  mode: ApprovalMode;
}

/** 依頼 1 件ぶんの承認枠（ALL では必須チェックリスト、ANY では表示用）。 */
export interface RequiredApproverState {
  userId: string;
  /** 承認済みなら日時、未承認なら null。 */
  actedAt: string | Date | null;
}

/** 書類から見た承認の局面。 */
export type ApprovalPhase = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

/**
 * 承認 1 件を適用したあと、この段が閉じるか。
 *
 * ANY は 1 件で閉じる（呼び出し側が枠を 1 つ埋めてから呼ぶ）。
 * ALL は全枠が埋まったときだけ閉じる。枠が 0 件（グループが空 / 全員が期間外）
 * のときは閉じる扱い — 閉じないと誰も進められず書類が詰むため。
 */
export function isStepComplete(
  mode: ApprovalMode,
  required: RequiredApproverState[],
): boolean {
  if (mode === "ANY") return true;
  return required.every((r) => r.actedAt != null);
}

/** 未承認の対象者（ALL の「残り N 名」表示に使う）。 */
export function remainingApprovers(
  required: RequiredApproverState[],
): string[] {
  return required.filter((r) => r.actedAt == null).map((r) => r.userId);
}

export interface AfterApprovalDecision {
  /** この段が閉じたか。 */
  stepClosed: boolean;
  /** フロー全体が終わったか（= 最終段が閉じた）。 */
  flowCompleted: boolean;
  /** 次に作る段。閉じていない or 最終段なら null。 */
  nextStepNo: number | null;
}

/** 承認直後の遷移判定。 */
export function decideAfterApproval(input: {
  mode: ApprovalMode;
  required: RequiredApproverState[];
  stepNo: number;
  stepCount: number;
}): AfterApprovalDecision {
  const stepClosed = isStepComplete(input.mode, input.required);
  if (!stepClosed) {
    return { stepClosed: false, flowCompleted: false, nextStepNo: null };
  }
  const isLast = input.stepNo >= input.stepCount;
  return {
    stepClosed: true,
    flowCompleted: isLast,
    nextStepNo: isLast ? null : input.stepNo + 1,
  };
}

/**
 * Mantine Stepper の active index（0 起点）。
 * PENDING は現在段を指し、APPROVED は全段の先（= 完了）を指す。
 * NONE / REJECTED はどの段もアクティブにしない。
 */
export function stepperActive(
  stepCount: number,
  currentStepNo: number,
  phase: ApprovalPhase,
): number {
  if (phase === "APPROVED") return stepCount;
  if (phase === "PENDING") return Math.max(0, currentStepNo - 1);
  return -1;
}

/** フロー編集の 1 行（画面の state と Server Action の入力が同じ形）。 */
export interface FlowStepDraft {
  nameJa: string;
  groupId: number | null;
  mode: ApprovalMode;
}

/**
 * フロー定義の検証。エラー文言の配列（空 = OK）。
 * 画面はボタンを止めるために、Server Action は保存を弾くために同じものを使う。
 */
export function validateFlowSteps(steps: FlowStepDraft[]): string[] {
  const issues: string[] = [];
  if (steps.length === 0) {
    issues.push("承認ステップを 1 段以上設定してください");
    return issues;
  }
  const noName: number[] = [];
  const noGroup: number[] = [];
  steps.forEach((s, i) => {
    if (!s.nameJa.trim()) noName.push(i + 1);
    if (s.groupId == null) noGroup.push(i + 1);
  });
  if (noName.length > 0) {
    issues.push(`${noName.join(", ")} 段目: 名称を入力してください`);
  }
  if (noGroup.length > 0) {
    issues.push(`${noGroup.join(", ")} 段目: 承認グループを選択してください`);
  }
  return issues;
}

// ─── 承認が本当に通ったか（確定の前提） ─────────────────────────────────────
//
// 書類の status 列（APPROVED 等）は承認時に併せて書く**派生値**でしかない。
// 実運用では psql やスクリプトで直接 DB を触ることがある（復旧・移行）ので、
// 列だけを見て確定すると「承認を通っていない書類が確定できる」道が残る。
// 確定のような後戻りできない一歩は、承認の**記録**（approval_requests）を
// 読んでここで判定する。

/** 承認が完了していない理由。 */
export type ApprovalIncompleteReason =
  | "NO_REQUEST" // 承認依頼の記録が無い（承認を通っていない）
  | "PENDING" // まだ承認待ちの段がある
  | "REJECTED" // 差し戻されたまま
  | "INCOMPLETE"; // 途中の段で止まっている（最終段まで届いていない）

/** 判定に要る依頼 1 件（DB の行でもテストの値でも渡せる形）。 */
export interface ApprovalRequestState {
  stepNo: number;
  stepCount: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface ApprovalCompletion {
  ok: boolean;
  reason?: ApprovalIncompleteReason;
  /** 到達している段 / 全段数（メッセージ用。記録が無ければ 0）。 */
  stepNo: number;
  stepCount: number;
}

/**
 * 承認の記録から「全段通ったか」を決める。
 *
 * 渡すのはその書類（世代）の依頼行**すべて**で、順序は問わない。
 * 差し戻し → 再依頼で同じ段の行が何度も増えるので、最後の 1 件は
 * **段番号ではなく依頼日時**で決める（古い段 2 の差し戻しが、新しい段 1 の
 * 承認より後ろに来てしまうのを避ける）。
 */
export function decideApprovalCompletion(
  rows: readonly (ApprovalRequestState & {
    requestedAt: Date | string | null;
  })[],
): ApprovalCompletion {
  if (rows.length === 0) {
    return { ok: false, reason: "NO_REQUEST", stepNo: 0, stepCount: 0 };
  }
  const pending = rows.find((r) => r.status === "PENDING");
  if (pending) {
    return {
      ok: false,
      reason: "PENDING",
      stepNo: pending.stepNo,
      stepCount: pending.stepCount,
    };
  }
  const time = (v: Date | string | null) =>
    v == null ? 0 : v instanceof Date ? v.getTime() : new Date(v).getTime();
  const last = [...rows].sort(
    (a, b) => time(b.requestedAt) - time(a.requestedAt) || b.stepNo - a.stepNo,
  )[0];
  if (last.status === "REJECTED") {
    return {
      ok: false,
      reason: "REJECTED",
      stepNo: last.stepNo,
      stepCount: last.stepCount,
    };
  }
  if (last.stepNo < last.stepCount) {
    return {
      ok: false,
      reason: "INCOMPLETE",
      stepNo: last.stepNo,
      stepCount: last.stepCount,
    };
  }
  return { ok: true, stepNo: last.stepNo, stepCount: last.stepCount };
}

/** 確定を止めるときに出す一行（画面にそのまま出す）。 */
export function approvalCompletionMessage(c: ApprovalCompletion): string {
  switch (c.reason) {
    case "NO_REQUEST":
      return "承認の記録がありません（承認依頼から進めてください）";
    case "PENDING":
      return `承認が完了していません（${c.stepNo}/${c.stepCount} 段目が承認待ちです）`;
    case "REJECTED":
      return "差し戻されています（もう一度承認を通してください）";
    case "INCOMPLETE":
      return `承認が完了していません（${c.stepNo}/${c.stepCount} 段までしか進んでいません）`;
    default:
      return "承認が完了していません";
  }
}

/** flow_snapshot（Json）から 1 段を取り出す。範囲外・壊れた値は null。 */
export function stepFromSnapshot(
  snapshot: unknown,
  stepNo: number,
): FlowStepSnapshot | null {
  if (!Array.isArray(snapshot)) return null;
  const found = (snapshot as FlowStepSnapshot[]).find(
    (s) => s?.stepNo === stepNo,
  );
  return found ?? null;
}

/** flow_snapshot（Json）を配列として読む（壊れた値は空配列）。 */
export function stepsFromSnapshot(snapshot: unknown): FlowStepSnapshot[] {
  if (!Array.isArray(snapshot)) return [];
  return (snapshot as FlowStepSnapshot[]).filter(
    (s) => s != null && typeof s.stepNo === "number",
  );
}
