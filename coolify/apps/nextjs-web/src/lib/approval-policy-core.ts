/**
 * approval-policy-core.ts — 書類種別ごとの「承認を使う / 使わない」（純ロジック）。
 *
 * 承認設定（MS0B）で種別ごとにスイッチを持つ:
 *
 *   ON  … 承認フローを通す。段が 1 つも無ければ**依頼できない**（一覧で赤）。
 *   OFF … 段が残っていても**承認なしで進める**（段は消さずに使わないだけ）。
 *
 * まだ誰もスイッチを触っていない種別（設定が無い）は**今までどおり**動く:
 *   段あり → 承認を通す
 *   段なし → 種別ごとの従来の挙動（LEGACY_EMPTY）— 依頼できない種別と、
 *            素通しする種別があった。スイッチを入れた時点でこの差は消える。
 *
 * 判定の唯一の定義はここ。呼び出し側（lib/approvals.ts approvalNeed）は
 * 設定と段の数を読んでここへ渡すだけ。
 */

import type { ApprovalTargetType } from "./approval-targets";

export type ApprovalPolicy = "on" | "off";

/** 判定の結果: 承認を通す / 承認なしで進める / 依頼できない。 */
export type ApprovalNeed = "flow" | "skip" | "blocked";

/**
 * 設定が無いとき、段が 0 本の種別がどう動いていたか（2026-11 時点の挙動）。
 * block = 依頼を拒んでいた / skip = 承認なしで通していた。
 */
export const LEGACY_EMPTY: Record<
  Exclude<ApprovalTargetType, "form_responses">,
  "block" | "skip"
> = {
  order_acceptances: "block",
  work_orders: "block",
  material_purchase_orders: "block",
  purchase_requests: "block",
  design_requests: "block",
  internal_pages: "block",
  work_order_flow_changes: "skip",
  order_acceptance_cancel_requests: "skip",
  delivery_orders: "skip",
  stock_takes: "skip",
  invoices: "skip",
  invoice_payments: "skip",
  design_versions: "skip",
  // 価格表は通常のフローを持たない（MS0B の一覧にも出さない）。承認が走るのは
  // 独自値の追加承認の段があるときだけで、段が無ければ素通し — なので skip。
  price_list_entries: "skip",
};

export function resolveApprovalNeed(input: {
  policy: ApprovalPolicy | null;
  stepCount: number;
  legacyEmpty: "block" | "skip";
}): ApprovalNeed {
  if (input.policy === "off") return "skip";
  if (input.stepCount > 0) return "flow";
  if (input.policy === "on") return "blocked";
  return input.legacyEmpty === "skip" ? "skip" : "blocked";
}

/** 一覧に出すスイッチの状態（設定が無ければ今の挙動から導く）。 */
export function effectivePolicy(input: {
  policy: ApprovalPolicy | null;
  stepCount: number;
  legacyEmpty: "block" | "skip";
}): ApprovalPolicy {
  return resolveApprovalNeed(input) === "skip" ? "off" : "on";
}

export function isApprovalPolicy(v: unknown): v is ApprovalPolicy {
  return v === "on" || v === "off";
}
