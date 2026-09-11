/**
 * url-state-core.ts — 「入力欄の値」と「URL の写し」を突き合わせる純ロジック。
 *
 * `hooks/useUrlState.ts` から切り出してある（DOM も React も要らない判定なので、
 * ここだけを単体で試験する — lib/tab-overflow.ts と同じ約束）。
 *
 * 解いている問題は 1 つだけ:
 *
 *   画面が書いた値と、あとから返ってくる URL の値は**同じタイミングでは来ない**。
 *   Next.js は `window.history.replaceState` をネイティブに受けて
 *   `startTransition` の中で router state を更新する（app-router.tsx の
 *   `applyUrlFromHistoryPushReplace`）ので、`useSearchParams()` は打鍵直後の
 *   レンダーではまだ**古い値**を返す。そのまま制御された `<input>` の value に
 *   使うと、1 打ごとに古い値を DOM へ書き戻すことになり、**日本語入力の
 *   変換中の文字列が壊れる**（ブラウザの変換範囲が潰れ、次の候補が置換では
 *   なく追記になる — 「あさひ」→「ああさあさひ朝日」）。
 *
 * そこで「自分が書いた値」を正とし、URL がそれに追いつくまでは URL からの
 * 値を**無視する**。追いついたら印を下ろし、以後の URL の変化（戻る/進む・
 * リンク・別画面からの遷移）は外からの変更として取り込む。
 */

/** 「URL の反映を待っている値は無い」を表す番兵（null / "" と区別する）。 */
export const NOT_PENDING: unique symbol = Symbol("not-pending");

export interface MirroredState<T> {
  /** 画面に出す値（入力欄の value）。 */
  value: T;
  /** URL がこの値になるのを待っている、という印。 */
  pending: T | typeof NOT_PENDING;
}

/** 自分の更新。次のレンダーで即座に反映し、URL の追いつきを待つ。 */
export function writeMirrored<T>(value: T): MirroredState<T> {
  return { value, pending: value };
}

/**
 * URL（`source`）を受けて次の状態を返す。変化が無ければ**同じ参照**を返す
 * （レンダー中の setState を呼ぶかどうかの判定に使う）。
 */
export function reconcileMirrored<T>(
  state: MirroredState<T>,
  source: T,
): MirroredState<T> {
  if (state.pending !== NOT_PENDING) {
    // 待っている値に URL が追いついた → 印を下ろす。追いついていない間の
    // source は「打鍵前の古い値」なので、取り込んではいけない。
    return source === state.pending
      ? { value: state.value, pending: NOT_PENDING }
      : state;
  }
  // 待っていないのに違う → 外から変わった（戻る/進む・リンク）。
  return source === state.value
    ? state
    : { value: source, pending: NOT_PENDING };
}
