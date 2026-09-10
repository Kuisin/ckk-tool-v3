/**
 * work-plan-core.ts — 「承認前に作業計画が揃っているか」の判定（pure / client-safe）。
 *
 * 指示書は承認を通ってから現場に降りる。そのときに「誰が・いつ・どこで」が
 * 決まっていない工程があると、承認者は工程の並びしか見ていないのに承認した
 * ことになり、現場では計画パネルを開いてから作業場所を探すことになる。
 * 承認依頼を出す時点で計画を要求するのはそのため。
 *
 * 要求するもの（§7）:
 *   - 社内工程（execution_location = INTERNAL）ごとに作業計画が 1 行以上
 *   - その計画に **計画日** と **作業場所** が入っている
 *   - 開始 / 終了時刻は従来どおり任意
 * 外注工程は対象外 — 作業場所は社内の機械/エリアで、外注先には当てはまらない
 * （外注は 依頼日 / 入荷予定日 を別に持つ）。キャンセル済みの工程も対象外。
 *
 * ★ 作業場所マスタが空の環境では作業場所を要求しない。「1 つも登録していない」
 *   状態で全指示書の承認を止めるのは、設定漏れの罰としては重すぎる。判定の
 *   入力に `workLocationsConfigured` を持たせ、呼び出し側が明示的に渡す。
 *
 * サーバー（承認依頼のゲート）と画面（承認カードの案内・ビルダーの印）が
 * 同じ関数を使う。
 */

export interface PlanReadinessStep {
  stepId: string;
  name: string;
  executionLocation: "INTERNAL" | "OUTSOURCE";
  status: string;
  plans: readonly {
    /** 計画日（無い行は無い — DB は NOT NULL だが型の都合で任意に受ける）。 */
    plannedDate: string | Date | null;
    workLocationId: number | null;
  }[];
}

/** 揃っていない工程 1 件と、何が足りないか。 */
export interface PlanReadinessGap {
  stepId: string;
  name: string;
  /** NO_PLAN = 計画が 1 行も無い / NO_LOCATION = 計画はあるが作業場所が無い */
  reason: "NO_PLAN" | "NO_LOCATION";
}

export interface PlanReadiness {
  ok: boolean;
  gaps: PlanReadinessGap[];
}

/** 計画 1 行が「揃っている」か。 */
function planComplete(
  plan: PlanReadinessStep["plans"][number],
  requireLocation: boolean,
): boolean {
  if (plan.plannedDate == null) return false;
  if (requireLocation && plan.workLocationId == null) return false;
  return true;
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
      gaps.push({ stepId: step.stepId, name: step.name, reason: "NO_PLAN" });
      continue;
    }
    const complete = step.plans.some((p) =>
      planComplete(p, options.workLocationsConfigured),
    );
    if (!complete) {
      gaps.push({
        stepId: step.stepId,
        name: step.name,
        reason: "NO_LOCATION",
      });
    }
  }
  return { ok: gaps.length === 0, gaps };
}
