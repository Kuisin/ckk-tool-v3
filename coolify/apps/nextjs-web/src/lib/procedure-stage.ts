/**
 * procedure-stage.ts — 手続き状況（ProcedurePanel §12.10）の段と、その状態。
 *
 * **段の状態は段が自分で名乗る。** 以前は「達成済みの段数」を表す `active` を
 * 呼び出し側が計算し、パネルが index の大小から状態を逆算していた。同じ数に
 * 2 通りの読み方（「いまこの段に居る」/「この段まで済んだ」）が生まれ、画面
 * ごとに別の読み方で書かれていたので、済んだ段にスピナーが出る書類があった
 * （納品書の「発行」— 発行済なのに発行中に見える）。数を渡すのをやめて、
 * 段ごとに 4 つの状態のどれかを持たせる。
 *
 *   done     済んだ段（チェック）
 *   current  いまここ（スピナー。書類が留まっている段は 1 つだけ）
 *   pending  まだ来ていない段（番号）
 *   skipped  もう通らない段（横棒）— キャンセル済みの書類の残りなど
 *
 * 直線のライフサイクルは `procedureStages(defs, current)` で組み立てる。
 * 渡す `current` は**いま留まっている段の index**で、「済んだ段の数」ではない
 * — 全段が済んだ書類だけが `defs.length`（= どの段にも留まっていない）になる。
 * まだどの段にも入っていない（承認依頼を出していない等）ときは `-1`。
 */

/** 段の状態。1 状態 = 1 アイコンで、重ねない。 */
export type ProcedureStageState = "pending" | "current" | "done" | "skipped";

/** 段の中身（状態を除く）。呼び出し側が書くのはこの形。 */
export interface ProcedureStageDef {
  key: string;
  label: string;
  /** 補足（日時・承認グループ・差し戻し理由など）。 */
  description?: string | null;
  /**
   * 色の上書き（差し戻し = red / 期限切れ = orange。_specs/design.md §9）。
   * **状態に依らず効く** — 済んだ段にも印を付けられる（発行済みだが期限切れ、など）。
   */
  color?: string;
}

/** 表示に渡す段。 */
export interface ProcedureStage extends ProcedureStageDef {
  state: ProcedureStageState;
}

/**
 * 直線のライフサイクルから各段の状態を決める。
 *
 * @param current いま留まっている段の index。`defs.length` = 全段完了、
 *   負数 = まだどの段にも入っていない（全段 pending）。
 * @param opts.stopped 進行が止まった書類（キャンセル・差し戻しで閉じた等）。
 *   `current` 以降は「まだ来ていない」ではなく **skipped**（もう通らない）。
 */
export function procedureStages(
  defs: readonly ProcedureStageDef[],
  current: number,
  opts: { stopped?: boolean } = {},
): ProcedureStage[] {
  const reached = Math.min(current, defs.length);
  return defs.map((def, i) => ({
    ...def,
    state: stageState(i, reached, opts.stopped ?? false),
  }));
}

function stageState(
  i: number,
  reached: number,
  stopped: boolean,
): ProcedureStageState {
  if (i < reached) return "done";
  if (stopped) return "skipped";
  return i === reached ? "current" : "pending";
}

/**
 * Mantine Stepper に渡す active index。
 *
 * current の段がそれ。無ければ done の数（= 完了した書類なら段数、止まった
 * 書類なら止まった位置、未着手なら 0）。
 *
 * **見た目は index ではなく状態が決める** — 表示側は 4 状態それぞれに
 * アイコンと色を当てるので、この index が 1 つずれても済んだ段が未了に
 * 化けたりしない。Mantine の Stepper が繋ぎ線を引くために要るだけ。
 */
export function activeStageIndex(stages: readonly ProcedureStage[]): number {
  const i = stages.findIndex((s) => s.state === "current");
  if (i >= 0) return i;
  return stages.filter((s) => s.state === "done").length;
}
