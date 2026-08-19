/**
 * bp-match.ts — AI が読み取った社名から取引先を引き当てる。純ロジック。
 *
 * これは「人が打った語で探す」bp-search とは別の問題を解く。人は探すために
 * **打ち直せる** が、AI は書類に**印字されたまま**の社名を返す（抽出プロンプトが
 * そう指示している）。印字は登録済みの照合名と 1 文字違うことが普通にある:
 *
 *   登録 `武蔵精密工業`          印字 `武蔵精密工業株式会社`     ← 法人格が付く
 *   登録 `株式会社クラタ`        印字 `株式会社クラタ 名古屋営業所` ← 支店が続く
 *   登録 `ビーティーティｰ…`     印字 `ビーティーティー…`         ← 半角/全角ゆれ
 *   登録 `㈱稔産業`              印字 `(株) 稔産業`               ← 記号・空白ゆれ
 *
 * 以前はここが配列の**完全一致**（`match_names has ?`）だったため、上のどれも
 * 外れて「一致する取引先がありません」になっていた。照合名は貯まっているのに
 * 引けない、という状態だったので、段階的な突合に置き換える。
 *
 * 段階（上から順に試し、当たった段で止める）:
 *   1. exact      — 生の文字列が照合名と完全一致
 *   2. normalized — 正規化キー（bp-search searchKey + カタカナ寄せ）が一致
 *   3. prefix     — 法人格を外すと、照合名が読み取り文字列の**頭から**一致
 *                   （法人格が前後どちらに付いても、支店名が後ろに続いてもよい）
 *   4. partial    — 読み取り文字列が照合名の一部（略称で書かれている）
 *
 * 1〜3 は 1 件に絞れたときだけ自動確定する。4 は当たりが広いので**候補**止まり
 * （画面で 1 クリックで選ぶ）。誤った顧客を黙って結び付けるより、選ばせる方が安い。
 *
 * 3 を「頭から」に限るのは、社名が [核][法人格][支店・部署] の順で印字されるため。
 * 途中の一致まで許すと `武蔵精密工業株式会社` に別会社の `精密工業株式会社` が
 * 当たってしまう（しかも長い方が勝つので、黙って間違える）。
 */

import { type BpSearchable, bpSearchKeys, searchKey } from "./bp-search";
import { toKatakana } from "./company-aliases";

/** 突合の当たり方。画面の言い回しと自動確定の可否を決める。 */
export type BpMatchConfidence =
  /** 照合名と完全一致。 */
  | "exact"
  /** 表記ゆれを吸収したら一致。 */
  | "normalized"
  /** 法人格を外すと頭から一致（法人格・支店などが付いた形）。 */
  | "prefix"
  /** 読み取り文字列が照合名に含まれる（略称）。自動確定はしない。 */
  | "partial";

/** 自動確定してよい当たり方（partial は人が選ぶ）。 */
const AUTO_CONFIRMABLE: ReadonlySet<BpMatchConfidence> = new Set([
  "exact",
  "normalized",
  "prefix",
]);

/** 突合対象の取引先 1 件。 */
export interface BpMatchable extends BpSearchable {
  id: string;
  /** 画面表示用の名称（通常は名称 ja）。 */
  label: string;
  /**
   * 顧客ロールを持つか。注文請書の顧客に**自動で**入れてよいのは顧客だけ
   * （ピッカーが出すのも顧客のみ）。仕入先しか当たらなかった場合は候補に留める。
   */
  isCustomer?: boolean;
}

export interface BpMatchCandidate {
  id: string;
  label: string;
  /** 当たった照合名（生の形）。「なぜこれが候補なのか」を画面に出すため。 */
  matchedKey: string;
  confidence: BpMatchConfidence;
}

export interface BpMatchResult {
  /** 自動確定できた 1 件（絞れなかった / partial 止まりなら null）。 */
  matched: BpMatchCandidate | null;
  /** 人に選ばせる候補（確度順・最大 SUGGESTION_LIMIT 件）。matched があるときは空。 */
  candidates: BpMatchCandidate[];
}

/** 画面に出す候補の上限。並べすぎると選ぶ気が失せる。 */
export const SUGGESTION_LIMIT = 5;

/**
 * 頭から一致に使ってよい核の最小長。2 文字の社名（`兼房` など）が実在するので
 * ここは 2。頭から当たったうえで**いちばん長いものが 1 件だけ**という条件が
 * 効くので、短い核が広く当たっても勝ち残らない。
 */
const MIN_PREFIX_LEN = 2;

/**
 * 一部一致（略称）に使ってよい最小長。途中一致は当たりが広いので 3 文字から。
 */
const MIN_PARTIAL_LEN = 3;

/** 宛名の敬称。書類には社名の後ろに必ず付いてくるので落とす。 */
const HONORIFICS = /(御中|様|殿|各位)\s*$/u;

/**
 * `(株)` `（株）` `㈱` を `株式会社` に開く。**searchKey にかける前**に行う —
 * searchKey は括弧を落とすので、先に開かないと `(株)` が裸の `株` になり、
 * `有沢製作所` の `有` のような社名の一部と見分けが付かなくなる。
 * （`㈱` は NFKC で `(株)` になるので、この 1 本で両方を拾う）
 */
function expandLegalMarks(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[(（]\s*株\s*[)）]/g, "株式会社")
    .replace(/[(（]\s*有\s*[)）]/g, "有限会社")
    .replace(/[(（]\s*同\s*[)）]/g, "合同会社");
}

/**
 * 法人格（正規化キー上の形）。日本語の法人格は**社名の途中にも入る**
 * （`THKリズム株式会社 九州工場`）ので、位置を問わず落とす。2 文字以上の
 * 明確な語だけなので、社名の一部を削る心配はない。
 */
const LEGAL_ANY = /株式会社|有限会社|合同会社|合資会社|合名会社/g;
/** 英語の法人格は語末・語頭のみ（社名の一部になり得るため）。 */
const LEGAL_EN = /^(COLTD|LTD|INC|CORP)|(COLTD|LTD|INC|CORPORATION|CORP)$/g;

/**
 * 正規化キーから法人格を外した「核」。比較と**長さの比べ合い**に使う。
 * 法人格の字数で勝ち負けが決まらないようにするため（`株式会社ジェイテクト` が
 * `ジェイテクト豊橋` より長い、という理由で勝ってしまうのを防ぐ）。
 */
export function bpCoreKey(key: string): string {
  return key.replace(LEGAL_ANY, "").replace(LEGAL_EN, "");
}

/**
 * 突合用の正規化キー。bp-search の searchKey（NFKC・大文字化・空白と記号の除去）に
 * **かな寄せ**（ひらがな→カタカナ）を足したもの。
 *
 * かなを寄せるのは match_names_auto が「カタカナ・ひらがな・ローマ字」の 3 通りを
 * 持っており、どちらで印字されても同じ鍵に落としたいため。
 */
export function bpMatchKey(raw: string): string {
  return toKatakana(searchKey(expandLegalMarks(raw)));
}

/** 読み取り文字列から敬称を落とした変種（元の形も含む）。 */
function readVariants(read: string): string[] {
  const base = read.trim();
  const stripped = base.replace(HONORIFICS, "").trim();
  return base === stripped ? [base] : [base, stripped];
}

/** 取引先 1 件の照合名（生の形）— 一致した「元の表記」を画面に出すために生で持つ。 */
function rawKeys(bp: BpMatchable): string[] {
  const parts = [
    bp.nameJa,
    bp.nameEn,
    bp.nameKana,
    bp.shortName,
    ...(bp.matchNames ?? []),
    ...(bp.matchNamesAuto ?? []),
  ];
  return [...new Set(parts.map((p) => (p ?? "").trim()).filter(Boolean))];
}

interface Hit {
  bp: BpMatchable;
  matchedKey: string;
  /** 絞り込み用の重み。長く当たったものほど具体的。 */
  score: number;
}

/**
 * 読み取った社名 → 取引先。プールは呼び出し側が用意する
 * （有効な取引先は数百件なので、全件を渡して JS で判定して十分）。
 */
export function matchBusinessPartnerName(
  read: string | null | undefined,
  pool: BpMatchable[],
): BpMatchResult {
  const empty: BpMatchResult = { matched: null, candidates: [] };
  if (!read || !read.trim()) return empty;

  const variants = readVariants(read);
  const variantKeys = variants.map(bpMatchKey).filter(Boolean);
  if (variantKeys.length === 0) return empty;

  // 段ごとに当たりを集め、最初に当たった段だけを使う。
  // （下の段は必ず上の段を含むので、混ぜると弱い当たりで薄まる）
  const tiers: { confidence: BpMatchConfidence; hits: Hit[] }[] = [
    { confidence: "exact", hits: [] },
    { confidence: "normalized", hits: [] },
    { confidence: "prefix", hits: [] },
    { confidence: "partial", hits: [] },
  ];
  const push = (c: BpMatchConfidence, hit: Hit) => {
    const tier = tiers.find((t) => t.confidence === c);
    // 同じ取引先は、その段でいちばん長く当たったものだけ残す。
    const prev = tier?.hits.find((h) => h.bp.id === hit.bp.id);
    if (!prev) tier?.hits.push(hit);
    else if (hit.score > prev.score) {
      prev.matchedKey = hit.matchedKey;
      prev.score = hit.score;
    }
  };

  for (const bp of pool) {
    const raws = rawKeys(bp);
    // 正規化キーは bp-search と同じ組み立て（bpCode も含む）にかな寄せを足す。
    const keyed = [
      ...new Set([
        ...raws.map((r) => bpMatchKey(r)),
        ...bpSearchKeys(bp).map((k) => toKatakana(k)),
      ]),
    ].filter(Boolean);

    for (const variant of variants) {
      if (raws.some((r) => r === variant)) {
        push("exact", { bp, matchedKey: variant, score: variant.length });
      }
    }
    for (const vk of variantKeys) {
      const vCore = bpCoreKey(vk);
      const hit = keyed.find((k) => k === vk);
      if (hit) {
        push("normalized", {
          bp,
          matchedKey: labelForKey(raws, hit) ?? hit,
          score: bpCoreKey(hit).length,
        });
      }
      for (const k of keyed) {
        const kCore = bpCoreKey(k);
        if (kCore.length < MIN_PREFIX_LEN) continue;
        // 頭から一致 — 読み取り側に法人格や支店名が付いていても当たる。
        if (k !== vk && vCore.startsWith(kCore)) {
          push("prefix", {
            bp,
            matchedKey: labelForKey(raws, k) ?? k,
            score: kCore.length,
          });
        }
        // 読み取りが照合名の一部（略称）。当たりが広いので候補止まり。
        if (
          k !== vk &&
          kCore.length >= MIN_PARTIAL_LEN &&
          vCore.length >= MIN_PARTIAL_LEN &&
          kCore.includes(vCore)
        ) {
          push("partial", {
            bp,
            matchedKey: labelForKey(raws, k) ?? k,
            score: vCore.length,
          });
        }
      }
    }
  }

  for (const tier of tiers) {
    if (tier.hits.length === 0) continue;
    const ranked = rank(tier.hits);
    const best = ranked[0];
    // 最高スコアが 1 件だけ = ほかより具体的に当たっている、と見なす。
    const topScoreCount = ranked.filter((h) => h.score === best.score).length;
    const decisive =
      topScoreCount === 1 && AUTO_CONFIRMABLE.has(tier.confidence);
    if (decisive && best.bp.isCustomer !== false) {
      return {
        matched: {
          id: best.bp.id,
          label: best.bp.label,
          matchedKey: best.matchedKey,
          confidence: tier.confidence,
        },
        candidates: [],
      };
    }
    return {
      matched: null,
      candidates: ranked.slice(0, SUGGESTION_LIMIT).map((h) => ({
        id: h.bp.id,
        label: h.bp.label,
        matchedKey: h.matchedKey,
        confidence: tier.confidence,
      })),
    };
  }
  return empty;
}

/** 正規化キーから、それを生んだ生の表記を探す（画面に出すのは人が読める方）。 */
function labelForKey(raws: string[], key: string): string | null {
  return raws.find((r) => bpMatchKey(r) === key) ?? null;
}

/** 長く当たった順 → 名称順（同点の並びを安定させる）。 */
function rank(hits: Hit[]): Hit[] {
  return [...hits].sort(
    (a, b) => b.score - a.score || a.bp.label.localeCompare(b.bp.label, "ja"),
  );
}
