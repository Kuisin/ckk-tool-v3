/**
 * list-search.ts — 一覧のクライアント絞り込みで使う文字列の正規化。純ロジック。
 *
 * `toLowerCase().includes()` だけでは**日本語の入力が素通しで外れる**。
 * 実際に SY01 で報告された症状はこれで、原因は 2 つとも「打った文字」と
 * 「表に出ている文字」が字面として一致しないことだった:
 *
 *   - IME が全角のまま英数字を打つ（`ｄｅｍｏ` ≠ `demo`）。日本語キーボードでは
 *     ごく普通に起きる。NFKC で吸収する。
 *   - 空白の有無（`田中一郎` と `田中 一郎`）。氏名は姓名の間に空白が入るが、
 *     探すほうは続けて打つ。全角空白と半角空白の違いも同じ。
 *
 * ついでにカタカナ→ひらがなも畳む（`タナカ` で `たなか` を引ける）。
 * `lib/bp-search.ts` の searchKey と同じ考え方だが、あちらは社名専用で
 * 記号まで落とす。こちらは汎用なので記号は残す — `管理職（承認者）` の
 * 括弧を落とすと別の語と混ざりうるため。
 */

/** 比較用の鍵。全角→半角・小文字化・カナ→ひらがな・空白の除去。 */
export function listSearchKey(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

/**
 * query が候補のどれかに含まれるか。query が空なら常に true（絞り込まない）。
 * 候補は null / undefined を混ぜてよい（そのまま渡せるように）。
 */
export function listSearchMatch(
  query: string,
  candidates: readonly (string | null | undefined)[],
): boolean {
  const q = listSearchKey(query);
  if (!q) return true;
  return candidates.some((c) => c && listSearchKey(c).includes(q));
}
