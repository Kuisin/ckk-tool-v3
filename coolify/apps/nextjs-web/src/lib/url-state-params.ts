/**
 * url-state-params.ts — 一覧の URL パラメータ（`page` / `size` / `sort`）の
 * 読み書き規則。`hooks/useUrlState.ts` が nuqs のパーサとして使う。
 *
 * React も nuqs も要らない純ロジックなので、ここだけを単体で試験する
 * （lib/tab-overflow.ts と同じ約束）。**書式は共有リンク・ブックマークに
 * 残っている**ので、変えるときは古い URL が同じ意味で読めることを試験で守る。
 */

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

/** `?page=` — 1 始まり。数でない・0 以下は 1 ページ目として読む。 */
export const pageParam = {
  parse: (raw: string): number => Math.max(1, Number(raw) || 1),
  serialize: (page: number): string => String(page),
};

/** `?size=` — 正の数だけ受ける。それ以外は「指定なし」（呼び出し側の既定）。 */
export const sizeParam = {
  parse: (raw: string): number | null => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  },
  serialize: (size: number): string => String(size),
};

/**
 * `?sort=<列>.<asc|desc>` — 列名にドットを含められるよう**最後の**ドットで割る。
 * 向きが `desc` 以外（欠落・誤記）は昇順として読む。
 */
export const sortParam = {
  parse: (raw: string): SortState | null => {
    if (!raw) return null;
    const idx = raw.lastIndexOf(".");
    const key = idx > 0 ? raw.slice(0, idx) : raw;
    const dir = raw.slice(idx + 1);
    return { key, dir: dir === "desc" ? "desc" : "asc" };
  },
  serialize: (sort: SortState): string => `${sort.key}.${sort.dir}`,
  eq: (a: SortState, b: SortState): boolean =>
    a.key === b.key && a.dir === b.dir,
};
