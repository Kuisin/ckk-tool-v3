/**
 * flow-change-core.ts — 工程フロー変更の承認まわりの純ロジック。
 *
 * ここに置くのは「承認を通すのか、素通しなのか」「保留中の変更をどう表示するか」
 * といった I/O を伴わない判断だけ。DB を触る本体は lib/work-order-flow-changes.ts。
 */

/** 保留できる操作。payload はそれぞれの Server Action の入力そのもの。 */
export const FLOW_CHANGE_KINDS = {
  ADD_BRANCH: "ADD_BRANCH",
  UPDATE_BRANCH: "UPDATE_BRANCH",
  REMOVE_BRANCH: "REMOVE_BRANCH",
} as const;

export type FlowChangeKind =
  (typeof FLOW_CHANGE_KINDS)[keyof typeof FLOW_CHANGE_KINDS];

export const FLOW_CHANGE_KIND_LABEL: Record<string, string> = {
  ADD_BRANCH: "分岐の追加",
  UPDATE_BRANCH: "分岐の変更",
  REMOVE_BRANCH: "分岐の削除",
};

export const FLOW_CHANGE_STATUS_LABEL: Record<string, string> = {
  PENDING: "承認待ち",
  APPLIED: "適用済み",
  REJECTED: "差し戻し",
  CANCELLED: "取消",
  FAILED: "適用失敗",
};

/**
 * 承認フローの適用モード（approval_flows.apply_mode）。
 * PRE（既定）= 承認後に適用（従来動作）/ POST = 即時適用 + 事後承認。
 */
export function isPostApply(applyMode: string | null | undefined): boolean {
  return applyMode === "POST";
}

/**
 * 状態表示 — status × applied_at の直交を 1 つのラベルに畳む
 * （status の enum 自体は増やさない）。
 */
export function displayFlowChangeStatus(
  status: string,
  appliedAt: string | Date | null,
): string {
  if (status === "PENDING" && appliedAt != null) return "適用済み・承認待ち";
  if (status === "REJECTED" && appliedAt != null) return "差し戻し（適用済み）";
  return FLOW_CHANGE_STATUS_LABEL[status] ?? status;
}

/**
 * 「差し戻されたが適用済み」の警告を出すべきか — 事後承認（POST）で即時適用
 * した変更が差し戻された場合、工程は自動では戻らない。人が確認して手で直す
 * まで指示書詳細に赤アラートを出し続ける。
 */
export function needsRejectedAppliedAlert(row: {
  status: string;
  appliedAt: string | Date | null;
  acknowledgedAt: string | Date | null;
}): boolean {
  return (
    row.status === "REJECTED" &&
    row.appliedAt != null &&
    row.acknowledgedAt == null
  );
}

/**
 * 承認を通すべきか。
 *
 * **承認設定（MS0B）で「工程フロー変更」の段が 1 つも無ければ素通し** —
 * 承認を運用しない拠点や立ち上げ期に、承認待ちで現場が止まらないようにする
 * （ご要望どおりの「未設定なら skip」）。段があるときだけ変更を保留する。
 */
export function requiresApproval(flowStepCount: number): boolean {
  return flowStepCount > 0;
}

/**
 * 指示書の状態から見て、工程フロー変更をそもそも受け付けてよいか。
 * 下書き・承認前の指示書は普通に編集できるので保留の対象外
 * （承認が要るのは「もう現場が動ける状態の指示書を触るとき」）。
 */
export function isFlowChangeGated(workOrderStatus: string): boolean {
  return workOrderStatus === "APPROVED" || workOrderStatus === "IN_PROGRESS";
}

/** 保留中の変更を人に見せる 1 行（カード見出し用）。 */
export function describeFlowChange(kind: string, payload: unknown): string {
  const label = FLOW_CHANGE_KIND_LABEL[kind] ?? kind;
  const p = (payload ?? {}) as Record<string, unknown>;
  const qty = typeof p.routedQuantity === "number" ? p.routedQuantity : null;
  const steps = Array.isArray(p.catalogStepIds)
    ? p.catalogStepIds.length
    : null;
  const parts: string[] = [];
  if (steps != null) parts.push(`${steps} 工程`);
  if (qty != null) parts.push(`数量 ${qty}`);
  return parts.length > 0 ? `${label}（${parts.join(" / ")}）` : label;
}
