/**
 * step-work-hours.ts — 工程の実働時間の積算（純関数・isomorphic）。
 *
 * 実績は 1 作業セッション = 1 行（`work_order_step_actuals`）で記録される。
 * キオスクの一時停止は行を閉じて再開で新しい行を開くので、行ごとの
 * 開始〜終了を足すと「実際に手が動いていた時間」になる（休止時間は入らない）。
 *
 * 開始か終了が欠けている行（作業中・記録漏れ）と、終了が開始より前の行
 * （時刻の入力ミス）は無視する — 推測で埋めると実績が水増しされるため。
 */

export interface WorkSessionTimes {
  startedAt: Date | string | null;
  endedAt: Date | string | null;
}

const MS_PER_HOUR = 1000 * 60 * 60;

function toMs(value: Date | string | null): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * 実働時間の合計（h、小数第 2 位まで）。数えられる行が 1 つも無ければ null
 * （0 ではない — 「実績なし」と「0 時間」を区別するため）。
 */
export function sumActualWorkHours(
  sessions: readonly WorkSessionTimes[],
): number | null {
  let totalMs = 0;
  let counted = 0;
  for (const s of sessions) {
    const start = toMs(s.startedAt);
    const end = toMs(s.endedAt);
    if (start == null || end == null || end < start) continue;
    totalMs += end - start;
    counted += 1;
  }
  if (counted === 0) return null;
  return Math.round((totalMs / MS_PER_HOUR) * 100) / 100;
}
