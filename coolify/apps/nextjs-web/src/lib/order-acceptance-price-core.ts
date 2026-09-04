/**
 * order-acceptance-price-core.ts — 注文請書 明細の単価が「誰のものか」を決める
 * 純ロジック（§2 価格差異）。
 *
 * 単価の持ち主は 2 通りしかない:
 *
 *   価格表（既定）  行に該当する価格表（顧客 × 製品 × 注文種別 × 数量）があれば
 *                   単価はそれ。画面では読み取り専用で、保存時にサーバーが
 *                   解決した値を書く（クライアントの表示値は信用しない）。
 *   人（上書き）    「上書き」を明示的に入れた行だけ、人が単価を決める。
 *
 * この 1 本の区別が要るのは、**入力ミスと意図が同じ見た目になっていた**から。
 * 以前は全行が自由入力で、価格表と違えばどちらも「価格差異」の同じ警告になり、
 * 承認依頼のたびに「確認しました」を押して通す運用になっていた。上書きを
 * 宣言できるようにすると、残った差異＝説明のつかない差異だけになる。
 *
 * I/O なし — 画面（ライブ表示・保存前の payload）とサーバー（保存時の解決・
 * 保存済みの照合）が同じ関数を使う。
 */

/**
 * 価格表から単価を引けなかった理由。
 *
 *   no-entry  顧客 × 製品のエントリが無い / 注文種別のバリアントが無い
 *   inactive  エントリまたはバリアントが無効化されている
 *   expired   バリアントの有効期間外（開始前・終了後）
 *   no-tier   **価格表はある**のに、数量を覆う数量段階が無い
 *
 * 最後の 1 つだけ扱いが違う。他の 3 つは「価格表なし」= 単価は自由入力で
 * 差異ではないが、no-tier は価格表があるのに使えていない状態なので、黙って
 * 自由入力にすると価格表の外の単価が確認なしに通る。
 */
export type PriceMissReason = "no-entry" | "inactive" | "expired" | "no-tier";

/** 明細 1 行の単価の状態。 */
export type AcceptancePriceState =
  /** 製品（または顧客）が未特定 — 価格表を引けない。差異ではない。 */
  | "unresolved"
  /** 製品は特定済みだが該当する価格表が無い — 単価は自由入力。 */
  | "unpriced"
  /**
   * 価格表はあるが数量を覆う段階が無い — 単価は自由入力になるが、
   * 差異と同じく承認依頼の前に確認を要求する（unpriced とは区別する）。
   */
  | "noTier"
  /** 価格表はあるが単価が未入力（readiness が別途止める）。 */
  | "unset"
  /** 価格表どおり。 */
  | "onList"
  /** 人が上書きした単価（価格表と違っても意図 — 差異として数えない）。 */
  | "override"
  /** 上書きの宣言が無いのに価格表と食い違う = 説明のつかない差異。 */
  | "diff";

export interface AcceptancePriceLineInput {
  /** 価格表を引ける行か（製品突合済み かつ 顧客特定済み）。 */
  matched: boolean;
  /** 価格表から解決した単価。null = 該当なし。 */
  expected: number | null;
  /** その行が持っている単価（保存値 or 入力値）。 */
  actual: number | null;
  /** 「上書き」が入っているか。 */
  overridden: boolean;
  /**
   * expected が null のとき、なぜ引けなかったか（解決側が返す）。省略 / null は
   * 「価格表なし」扱い。"no-tier" だけが noTier 状態になる。
   */
  missReason?: PriceMissReason | null;
}

/** 行の状態を決める（表示のバッジ・警告・集計はすべてこれを見る）。 */
export function acceptancePriceState(
  line: AcceptancePriceLineInput,
): AcceptancePriceState {
  if (!line.matched) return "unresolved";
  if (line.expected == null)
    return line.missReason === "no-tier" ? "noTier" : "unpriced";
  // 上書きは単価が無ければ成り立たない（未入力は未入力として出す）。
  if (line.actual == null) return "unset";
  if (line.overridden) return "override";
  return line.actual === line.expected ? "onList" : "diff";
}

/**
 * 実際に保存・集計する単価。
 *
 * 価格表があって上書きが無ければ**価格表の単価**（`entered` は無視する）。
 * それ以外は人が入れた値。画面の表示も payload も合計もこの 1 本を通すので、
 * 「見えている単価」と「保存される単価」がずれない。
 */
export function effectiveUnitPrice(line: {
  expected: number | null;
  entered: number | null;
  overridden: boolean;
}): number | null {
  if (line.expected != null && !line.overridden) return line.expected;
  return line.entered;
}

/**
 * 上書きの正規化 — 該当する価格表が無い行の上書きは意味を持たない
 * （外す相手がいない）。宣言だけが残ると「上書き 1 件」と表示され続けるので、
 * 保存の入口で落とす。
 */
export function normalizeOverride(line: {
  expected: number | null;
  overridden: boolean;
}): boolean {
  return line.expected != null && line.overridden;
}

export interface AcceptancePriceCounts {
  /**
   * 承認依頼の前に確認が要る行（承認依頼を止める）— 説明のつかない差異
   * （diff）と、価格表があるのに数量段階が無い行（noTier）の合計。
   */
  diffCount: number;
  /** 人が宣言した上書き（止めないが承認者には出す）。 */
  overrideCount: number;
  /** 価格表が無い行（自由入力）。 */
  unpricedCount: number;
  /** 価格表はあるが数量段階が無い行（diffCount に含まれる）。 */
  noTierCount: number;
}

/** 承認依頼の前に確認を要求する状態か（差異と同じ扱い）。 */
export function requiresPriceAcknowledgement(
  state: AcceptancePriceState,
): boolean {
  return state === "diff" || state === "noTier";
}

export function acceptancePriceCounts(
  states: readonly AcceptancePriceState[],
): AcceptancePriceCounts {
  return {
    diffCount: states.filter(requiresPriceAcknowledgement).length,
    overrideCount: states.filter((s) => s === "override").length,
    unpricedCount: states.filter((s) => s === "unpriced").length,
    noTierCount: states.filter((s) => s === "noTier").length,
  };
}
