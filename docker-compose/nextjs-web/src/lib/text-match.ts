/**
 * text-match.ts — 「書類に印字された文字列」からマスタを引き当てる段階的突合。純ロジック。
 *
 * AI 抽出（po-extract）は社名も品名も**印字されたまま**返す。印字は登録済みの
 * 表記と 1 文字違うことが普通にあり（法人格・支店名・記号・全角半角・敬称）、
 * 完全一致で引くとほとんど当たらない。かといって緩く当てると**黙って別のもの**を
 * 掴む。そこで当たり方に段階を付け、確実な段だけ自動確定して、曖昧な段は候補として
 * 人に返す。
 *
 * 段（上から試し、当たった段で止める）:
 *   1. exact      生の文字列が一致
 *   2. normalized 正規化キーが一致（正規化の中身は呼び出し側が決める）
 *   3. prefix     核が**頭から**一致（後ろに余計な語が続いていてよい）
 *   4. partial    読み取りが登録側の一部（略称）— **自動確定しない**
 *
 * 3 を「頭から」に限るのは、名前が [核][装飾][付加語] の順に書かれるため。
 * 途中一致まで許すと `武蔵精密工業株式会社` に別会社の `精密工業株式会社` が
 * 当たり、しかも長い方が勝つので黙って間違える。
 *
 * 対象ごとの違い（何を正規化と見なすか・何を「核」と見なすか）は rules で渡す:
 *   取引先 = lib/bp-match（法人格・敬称）/ 製品 = lib/product-match（寸法記号）。
 */

/** 当たり方。画面の言い回しと自動確定の可否を決める。 */
export type MatchTier = "exact" | "normalized" | "prefix" | "partial";

/** 自動確定してよい段（partial は必ず人が選ぶ）。 */
const AUTO_CONFIRMABLE: ReadonlySet<MatchTier> = new Set([
  "exact",
  "normalized",
  "prefix",
]);

/** 突合対象 1 件。 */
export interface MatchTarget {
  id: string;
  /** 画面表示用の名前。 */
  label: string;
  /** 照合に使う生の表記（別名・コード・読みなど。重複・空は無視される）。 */
  keys: string[];
  /**
   * 自動確定を許すか（既定 true）。当たっても人に選ばせたいものに false。
   * 例: 顧客ロールを持たない取引先。
   */
  autoConfirmable?: boolean;
}

export interface MatchHit {
  id: string;
  label: string;
  /** 当たった登録側の表記（生の形）。「なぜこれなのか」を画面に出すため。 */
  matchedKey: string;
  tier: MatchTier;
}

export interface TextMatchResult {
  /** 自動確定できた 1 件（絞れなかった / partial 止まりなら null）。 */
  matched: MatchHit | null;
  /** 人に選ばせる候補（確度順）。matched があるときは空。 */
  candidates: MatchHit[];
}

export interface TextMatchRules {
  /** 生の表記 → 比較用の正規化キー。 */
  normalize: (raw: string) => string;
  /** 正規化キー → 「核」。頭から一致の判定と長さ比べに使う（既定は恒等）。 */
  core?: (key: string) => string;
  /** 読み取り文字列 → 試す変種（敬称落としなど。既定は trim した 1 本）。 */
  variants?: (read: string) => string[];
  /** 頭から一致に使ってよい核の最小長（既定 2）。 */
  minPrefixLen?: number;
  /** 一部一致に使ってよい核の最小長（既定 3）。 */
  minPartialLen?: number;
  /** 候補の上限（既定 5）。並べすぎると選ぶ気が失せる。 */
  limit?: number;
}

interface Hit {
  target: MatchTarget;
  matchedKey: string;
  /** 絞り込み用の重み。長く当たったものほど具体的。 */
  score: number;
}

/**
 * 読み取り文字列 → 突合結果。対象は呼び出し側が用意する
 * （取引先は全件、製品は DB で候補を絞ってから渡す）。
 */
export function matchText(
  read: string | null | undefined,
  targets: MatchTarget[],
  rules: TextMatchRules,
): TextMatchResult {
  const empty: TextMatchResult = { matched: null, candidates: [] };
  if (!read || !read.trim()) return empty;

  const {
    normalize,
    core = (k) => k,
    variants: makeVariants = (r) => [r.trim()],
    minPrefixLen = 2,
    minPartialLen = 3,
    limit = 5,
  } = rules;

  const variants = [...new Set(makeVariants(read).filter(Boolean))];
  const variantKeys = [...new Set(variants.map(normalize).filter(Boolean))];
  if (variantKeys.length === 0) return empty;

  // 段ごとに当たりを集め、**最初に当たった段だけ**を使う（下の段は上の段を
  // 含むので、混ぜると弱い当たりで薄まる）。
  const tiers: { tier: MatchTier; hits: Hit[] }[] = [
    { tier: "exact", hits: [] },
    { tier: "normalized", hits: [] },
    { tier: "prefix", hits: [] },
    { tier: "partial", hits: [] },
  ];
  const push = (tier: MatchTier, hit: Hit) => {
    const bucket = tiers.find((t) => t.tier === tier);
    if (!bucket) return;
    // 同じ対象は、その段でいちばん長く当たったものだけ残す。
    const prev = bucket.hits.find((h) => h.target.id === hit.target.id);
    if (!prev) bucket.hits.push(hit);
    else if (hit.score > prev.score) {
      prev.matchedKey = hit.matchedKey;
      prev.score = hit.score;
    }
  };

  for (const target of targets) {
    const raws = [
      ...new Set(target.keys.map((k) => k?.trim()).filter(Boolean)),
    ];
    // 生 → 正規化キー の対応を持っておく（画面に出すのは人が読める生の方）。
    const keyed = new Map<string, string>();
    for (const raw of raws) {
      const key = normalize(raw);
      if (key && !keyed.has(key)) keyed.set(key, raw);
    }

    for (const variant of variants) {
      if (raws.includes(variant)) {
        push("exact", { target, matchedKey: variant, score: variant.length });
      }
    }
    for (const vk of variantKeys) {
      const vCore = core(vk);
      const exact = keyed.get(vk);
      if (exact !== undefined) {
        push("normalized", {
          target,
          matchedKey: exact,
          score: core(vk).length,
        });
      }
      for (const [k, raw] of keyed) {
        if (k === vk) continue;
        const kCore = core(k);
        // 頭から一致 — 読み取り側に付加語が続いていても当たる。
        if (kCore.length >= minPrefixLen && vCore.startsWith(kCore)) {
          push("prefix", { target, matchedKey: raw, score: kCore.length });
        }
        // 読み取りが登録側の一部（略称）。当たりが広いので候補止まり。
        if (
          kCore.length >= minPartialLen &&
          vCore.length >= minPartialLen &&
          kCore.includes(vCore)
        ) {
          push("partial", { target, matchedKey: raw, score: vCore.length });
        }
      }
    }
  }

  for (const { tier, hits } of tiers) {
    if (hits.length === 0) continue;
    const ranked = [...hits].sort(
      (a, b) =>
        b.score - a.score || a.target.label.localeCompare(b.target.label, "ja"),
    );
    const best = ranked[0];
    // 最高スコアが 1 件だけ = ほかより具体的に当たっている、と見なす。
    const decisive =
      ranked.filter((h) => h.score === best.score).length === 1 &&
      AUTO_CONFIRMABLE.has(tier);
    if (decisive && best.target.autoConfirmable !== false) {
      return { matched: toHit(best, tier), candidates: [] };
    }
    return {
      matched: null,
      candidates: ranked.slice(0, limit).map((h) => toHit(h, tier)),
    };
  }
  return empty;
}

const toHit = (h: Hit, tier: MatchTier): MatchHit => ({
  id: h.target.id,
  label: h.target.label,
  matchedKey: h.matchedKey,
  tier,
});
