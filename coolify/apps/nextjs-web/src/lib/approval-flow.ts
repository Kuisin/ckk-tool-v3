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
  /** 承認グループ宛の段。個人宛のときは null。 */
  groupId: number | null;
  groupName: LocalizedText;
  mode: ApprovalMode;
  /**
   * 個人宛の段（フォームのみ）。**グループとどちらか一方**。
   * 依頼時点の名前も写す — 後で改名・退職しても履歴が読めるように。
   */
  approverUserId?: string | null;
  approverName?: string | null;
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
  /** 個人宛の段（フォームのみ）。グループとどちらか一方が入っていればよい。 */
  approverUserId?: string | null;
}

/**
 * フロー定義の検証。エラー文言の配列（空 = OK）。
 * 画面はボタンを止めるために、Server Action は保存を弾くために同じものを使う。
 */
export function validateFlowSteps(
  steps: FlowStepDraft[],
  /** 段の宛先に個人を選べるか（フォームのみ true）。文言が変わる。 */
  allowIndividual = false,
): string[] {
  const issues: string[] = [];
  if (steps.length === 0) {
    issues.push("承認ステップを 1 段以上設定してください");
    return issues;
  }
  const noName: number[] = [];
  const noGroup: number[] = [];
  steps.forEach((s, i) => {
    if (!s.nameJa.trim()) noName.push(i + 1);
    // 個人宛は allowIndividual のときだけ「宛先あり」と認める。共通フロー
    // （MS0B）に個人が紛れ込んでも、宛先なしとして弾く。
    if (s.groupId == null && !(allowIndividual && s.approverUserId))
      noGroup.push(i + 1);
  });
  if (noName.length > 0) {
    issues.push(`${noName.join(", ")} 段目: 名称を入力してください`);
  }
  if (noGroup.length > 0) {
    issues.push(
      allowIndividual
        ? `${noGroup.join(", ")} 段目: 承認グループか承認者を選択してください`
        : `${noGroup.join(", ")} 段目: 承認グループを選択してください`,
    );
  }
  return issues;
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
