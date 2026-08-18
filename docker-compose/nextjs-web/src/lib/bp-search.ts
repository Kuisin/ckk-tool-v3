/**
 * bp-search.ts — 取引先を「照合キー」で探すための共通ロジック。純ロジック。
 *
 * AI 抽出のためだけに用意した照合名（match_names）とフリガナ由来の自動生成分
 * （match_names_auto）は、**人が探すときにも同じだけ役に立つ**。
 * 「THK」しか覚えていない、読みしか分からない、ローマ字で打つ — どれも
 * 社名の表記とは一致しないが、キーには入っている。
 *
 * ここでは 1 件ぶんの判定だけを持ち、画面（クライアント側の絞り込み）と
 * サーバー（ピッカーの検索）で同じ規則を使う。
 */

/** 検索対象になる取引先の断片。 */
export interface BpSearchable {
  bpCode?: string | null;
  nameJa?: string | null;
  nameEn?: string | null;
  nameKana?: string | null;
  shortName?: string | null;
  /** 人が入れた照合名。 */
  matchNames?: string[] | null;
  /** フリガナ等から自動生成した照合名（画面には出さない）。 */
  matchNamesAuto?: string[] | null;
}

/**
 * 比較用に正規化する: 全角→半角・大文字化・空白と記号を落とす。
 * 「THK (株)」「ＴＨＫ㈱」「thk」を同じ鍵にして、打ち方の違いで外さない。
 */
export function searchKey(raw: string): string {
  return raw
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s・･.,\-‐-―()（）｢｣「」]/g, "");
}

/** 検索対象の全キー（重複除去済み）。 */
export function bpSearchKeys(bp: BpSearchable): string[] {
  const parts = [
    bp.bpCode,
    bp.nameJa,
    bp.nameEn,
    bp.nameKana,
    bp.shortName,
    ...(bp.matchNames ?? []),
    ...(bp.matchNamesAuto ?? []),
  ];
  return [
    ...new Set(
      parts.map((p) => searchKey((p ?? "").trim())).filter((p) => p.length > 0),
    ),
  ];
}

/**
 * 入力語で当たるか（部分一致）。
 * 空の入力は「すべて当たる」— 呼び出し側で絞り込みを外すのに使う。
 */
export function bpMatchesQuery(bp: BpSearchable, query: string): boolean {
  const q = searchKey(query.trim());
  if (!q) return true;
  return bpSearchKeys(bp).some((key) => key.includes(q));
}
