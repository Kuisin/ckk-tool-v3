/**
 * tab-overflow.ts — タブを横並びのままにするか、ドロップダウンへ畳むかの判定。
 *
 * components/ui/AppTabs.tsx から DOM の実測値（本来必要な幅 / 使える幅）を
 * 渡して呼ぶ。判定だけを分けてあるのは、往復（畳む→戻る→畳む…）を起こさない
 * ことが唯一かつ重要な性質で、それを試験で固定したいため。
 */

/**
 * 戻す（横並びに直す）ときだけ要求する余白（px）。
 *
 * 畳む条件と戻す条件を同じ値にすると、ちょうど境界の幅で 1px の測り誤差でも
 * 畳む→戻る→畳む…と往復し続ける。戻すほうを少し厳しくして止める。
 */
export const TAB_COLLAPSE_HYSTERESIS = 8;

/**
 * 次の状態。**変える必要が無ければ null** — 呼び出し側は null のとき
 * setState を呼ばない（無駄な再描画と、再描画による再測定の連鎖を避ける）。
 *
 * `available <= 0` は「まだ測れない」（非表示のタブの中、初回描画前など）。
 * 幅 0 を「狭い」と読むと、開いた瞬間に全部が畳まれてしまう。
 */
export function nextTabsCollapsed(
  collapsed: boolean,
  needed: number,
  available: number,
  hysteresis: number = TAB_COLLAPSE_HYSTERESIS,
): boolean | null {
  if (!Number.isFinite(needed) || !Number.isFinite(available)) return null;
  if (available <= 0) return null;
  if (!collapsed) return needed > available ? true : null;
  return needed + hysteresis <= available ? false : null;
}
