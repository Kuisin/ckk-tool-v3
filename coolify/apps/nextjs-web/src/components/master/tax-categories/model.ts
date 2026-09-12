/**
 * model.ts — 税区分マスタ (MS0F) の純ロジック。I/O なし・vitest 対象。
 *
 * 率の「いつからいつまで」は DB が終了日を持たない（終わりは次の行の前日）ので、
 * 画面に出すときだけここで区間へ組み直す。率の**解決**そのものは
 * lib/tax-rate.ts `rateOnDate` が持つ — 表示の都合でロジックを二重に書かない。
 */

/** 画面が扱う率 1 行（effectiveFrom は JST 暦日 "YYYY-MM-DD"）。 */
export interface RateRow {
  id: number;
  effectiveFrom: string;
  /** 0.1 = 10%。DB の Decimal(5,4) を Number 化したもの。 */
  rate: number;
  notes: string;
}

/** 履歴を「適用開始日 → 終了日（次の行の前日）」の区間に組み直した 1 行。 */
export interface RatePeriod extends RateRow {
  /** 次の行が始まる前日。最新の行は null（＝現在も有効）。 */
  effectiveUntil: string | null;
  /** `basisDate` にこの行が効いているか。 */
  isCurrent: boolean;
}

/** "YYYY-MM-DD" の前日。月末・閏年は Date に任せる（UTC 固定で暦日だけ動かす）。 */
export function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 率の履歴を新しい順に並べ、終了日と「いま効いている行」を付ける。
 *
 * `isCurrent` が真になるのは**ちょうど 1 行**（基準日以前で最も新しい行）。
 * どの行もまだ始まっていなければ 0 行 — その状態は画面で「税率が未設定」と出す。
 */
export function ratePeriods(
  rates: readonly RateRow[],
  basisDate: string,
): RatePeriod[] {
  const asc = [...rates].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom
      ? -1
      : a.effectiveFrom > b.effectiveFrom
        ? 1
        : 0,
  );
  const currentFrom = asc
    .filter((r) => r.effectiveFrom <= basisDate)
    .at(-1)?.effectiveFrom;
  return asc
    .map((row, i) => {
      const next = asc[i + 1];
      return {
        ...row,
        effectiveUntil: next ? previousDay(next.effectiveFrom) : null,
        isCurrent: row.effectiveFrom === currentFrom,
      };
    })
    .reverse();
}

/** 基準日に効いている率。無ければ null（lib/tax-rate.ts rateOnDate と同じ規則）。 */
export function currentRate(
  rates: readonly RateRow[],
  basisDate: string,
): number | null {
  return ratePeriods(rates, basisDate).find((p) => p.isCurrent)?.rate ?? null;
}

/**
 * 率（0.1）を画面の「%」へ。**桁を落とさない** — 0.0825 を "8%" と出すと、
 * 設定した人には正しく入ったのか分からない。
 */
export function ratePercentLabel(rate: number): string {
  const pct = rate * 100;
  return `${Number(pct.toFixed(4))}%`;
}

/**
 * 「過去から始まる率を足そうとしている」か。
 *
 * 発行済みの請求書は税率を凍結しているので動かないが、**まだ確定していない書類**
 * （下書きの見積書・納品書 PDF の再生成）は基準日で引き直すため、過去日の行を足すと
 * さかのぼって変わる。画面はこれが真のときだけ警告を出す（毎回出すと読まれなくなる）。
 */
export function isBackdatedRate(effectiveFrom: string, today: string): boolean {
  return effectiveFrom < today;
}
