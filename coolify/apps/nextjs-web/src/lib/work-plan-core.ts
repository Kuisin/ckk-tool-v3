/**
 * work-plan-core.ts — 「承認前に作業計画が揃っているか」の判定（pure / client-safe）。
 *
 * 指示書は承認を通ってから現場に降りる。そのときに「誰が・いつ・どこで」が
 * 決まっていない工程があると、承認者は工程の並びしか見ていないのに承認した
 * ことになり、現場では計画パネルを開いてから作業場所を探すことになる。
 * 承認依頼を出す時点で計画を要求するのはそのため。
 *
 * **何を入れれば「揃った」かは工程マスタだけが決める**（§7）:
 *   - 担当者 と 計画日 は常に必須（列が NOT NULL — 計画の最小単位）
 *   - 作業場所 / 開始・終了時刻 / 数量 は工程ごとに 要る / 要らない
 *     （process_step_catalog の work_location_required / plan_time_required /
 *     plan_quantity_required）
 * 社内工程（execution_location = INTERNAL）ごとに、それらの揃った計画が 1 行以上。
 * 外注工程は対象外 — 作業場所は社内の機械/エリアで、外注先には当てはまらない
 * （外注は 依頼日 / 入荷予定日 を別に持つ）。キャンセル済みの工程も対象外。
 *
 * ★ 作業場所マスタが空の環境では作業場所を要求しない。「1 つも登録していない」
 *   状態で全指示書の承認を止めるのは、設定漏れの罰としては重すぎる。判定の
 *   入力に `workLocationsConfigured` を持たせ、呼び出し側が明示的に渡す。
 *
 * サーバー（承認依頼のゲート・addStepPlan）と画面（承認カードの案内・計画
 * パネルの必須印・ビルダーの印）が同じ関数を使う。
 */

/** 工程ごとに要否を切れる計画の項目。 */
export type PlanField = "WORK_LOCATION" | "TIME" | "QUANTITY";

/** 工程マスタが持つ計画の必須項目の印。 */
export interface PlanRequirementFlags {
  workLocationRequired?: boolean;
  planTimeRequired?: boolean;
  planQuantityRequired?: boolean;
}

/**
 * 工程の印 → その工程で要る項目。作業場所は工程の印 × 社内工程 × マスタに場所が
 * あるとき。計画パネルの必須印もこれで決める（ゲートと同じ相手を見る）。
 */
export function requiredPlanFields(
  step: PlanRequirementFlags & { executionLocation: "INTERNAL" | "OUTSOURCE" },
  options: { workLocationsConfigured: boolean },
): PlanField[] {
  if (step.executionLocation !== "INTERNAL") return [];
  const out: PlanField[] = [];
  if (options.workLocationsConfigured && step.workLocationRequired !== false)
    out.push("WORK_LOCATION");
  if (step.planTimeRequired) out.push("TIME");
  if (step.planQuantityRequired) out.push("QUANTITY");
  return out;
}

export interface PlanReadinessPlan {
  /** 計画日（無い行は無い — DB は NOT NULL だが型の都合で任意に受ける）。 */
  plannedDate: string | Date | null;
  workLocationId: number | null;
  plannedStartAt?: string | Date | null;
  plannedEndAt?: string | Date | null;
  quantity?: number | null;
}

export interface PlanReadinessStep extends PlanRequirementFlags {
  stepId: string;
  name: string;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  status: string;
  plans: readonly PlanReadinessPlan[];
}

/** 揃っていない工程 1 件と、何が足りないか。 */
export interface PlanReadinessGap {
  stepId: string;
  name: string;
  /** NO_PLAN = 計画が 1 行も無い / INCOMPLETE = 計画はあるが必須項目が空 */
  reason: "NO_PLAN" | "INCOMPLETE";
  /** INCOMPLETE のとき、どの行にも揃っていなかった項目。 */
  missing: PlanField[];
}

export interface PlanReadiness {
  ok: boolean;
  gaps: PlanReadinessGap[];
}

/** 計画 1 行に足りない項目。 */
export function missingPlanFields(
  plan: PlanReadinessPlan,
  required: readonly PlanField[],
): PlanField[] {
  const out: PlanField[] = [];
  if (plan.plannedDate == null) out.push("TIME"); // 日付が無い行は時刻も無い扱い
  for (const f of required) {
    if (f === "WORK_LOCATION" && plan.workLocationId == null) out.push(f);
    if (
      f === "TIME" &&
      (plan.plannedStartAt == null || plan.plannedEndAt == null)
    )
      out.push(f);
    if (f === "QUANTITY" && plan.quantity == null) out.push(f);
  }
  return [...new Set(out)];
}

/**
 * 承認依頼を出してよいか。`gaps` は工程順（渡された順）で、承認カードや
 * エラー文にそのまま並べられる。
 */
export function planReadiness(
  steps: readonly PlanReadinessStep[],
  options: { workLocationsConfigured: boolean },
): PlanReadiness {
  const gaps: PlanReadinessGap[] = [];
  for (const step of steps) {
    if (step.status === "CANCELLED") continue;
    if (step.executionLocation !== "INTERNAL") continue;
    if (step.plans.length === 0) {
      gaps.push({
        stepId: step.stepId,
        name: step.name,
        reason: "NO_PLAN",
        missing: [],
      });
      continue;
    }
    const required = requiredPlanFields(step, options);
    const perPlan = step.plans.map((p) => missingPlanFields(p, required));
    if (perPlan.some((m) => m.length === 0)) continue;
    // どの行も揃っていない — 一番足りないものが少ない行の不足を出す（直す量が最小）。
    const best = perPlan.reduce((a, b) => (b.length < a.length ? b : a));
    gaps.push({
      stepId: step.stepId,
      name: step.name,
      reason: "INCOMPLETE",
      missing: best,
    });
  }
  return { ok: gaps.length === 0, gaps };
}
