/**
 * material-match.ts — AI が読み取った素材の表記から素材マスタを引き当てる。純ロジック。
 *
 * 購買側の取込（仕入先の見積書・納品書）が使う。製品（lib/product-match）と
 * 同じ問題だが、素材には**製品に無い当たり方**がある:
 *
 *   1. **素材コードが書類にそのまま印字される。** `B01A0001-A060-310` の形で、
 *      これが当たれば迷う余地が無い（1 件に決まる）。仕入先はこちらの品番を
 *      注文どおりに刷り返してくるので、実際いちばんよく当たる経路。
 *   2. 名前で当てる。素材名は `超硬丸棒 φ6.0×310` のように**寸法が後ろに続く**
 *      ので、揺れ方は製品名と同じ。正規化は `productMatchKey` を共用する
 *      （lib/match-alias-core の `aliasKeyFor("materials", …)` も同じ鍵）。
 *
 * 素材マスタは製品マスタほど大きくない（材種 × 直径 × 全長の組合せで数千件）
 * ので、取引先と同じく**全件を渡して JS で突合**する。probe の梯子（DB に
 * 候補を出させる）は要らない。
 *
 * 判定の段（完全 → 正規化 → 頭から → 一部）と自動確定の可否は lib/text-match が
 * 持つ。ここが持つのは「素材に固有の照合キーの作り方」だけ。
 */

import { productMatchKey } from "./product-match";
import {
  type MatchTarget,
  type MatchTier,
  matchText,
  type TextMatchRules,
} from "./text-match";

/** 突合対象の素材 1 件。 */
export interface MaterialMatchable {
  /** 素材の内部 id を文字列で持つ（SearchSelect の値と揃える）。 */
  id: string;
  /** 画面表示用（コード（名称））。 */
  label: string;
  /** 素材コード B01A0001-A060-310。 */
  code?: string | null;
  nameJa?: string | null;
  nameEn?: string | null;
  /** メーカー型式（仕入先の書類にはこちらが印字されることがある）。 */
  manufacturerModel?: string | null;
  /**
   * キーワード（materials.match_names — マスタ MS06 の「キーワード」欄）+
   * 学習した表記（app.match_aliases）。呼び出し側が合わせて渡す。
   */
  keywords?: readonly string[] | null;
  /** 単位（選ばれた行の数量欄に使う。突合には使わない）。 */
  unit?: string | null;
}

export interface MaterialMatchCandidate {
  id: string;
  label: string;
  /** 当たった登録側の表記（なぜ候補なのかを画面に出すため）。 */
  matchedKey: string;
  confidence: MatchTier;
}

export interface MaterialMatchResult {
  matched: MaterialMatchCandidate | null;
  candidates: MaterialMatchCandidate[];
}

/** 画面に出す候補の上限。 */
export const MATERIAL_SUGGESTION_LIMIT = 5;

/**
 * 頭から一致・一部一致に使ってよい最小長。製品（4）と同じ — 素材名は
 * `超硬丸棒` のように共通部分が長く、短い一致で自動確定すると別の径・
 * 別の材種を掴む。素材を取り違えると在庫と原価の両方がずれる。
 */
const MIN_LEN = 4;

const MATERIAL_RULES: TextMatchRules = {
  normalize: productMatchKey,
  minPrefixLen: MIN_LEN,
  minPartialLen: MIN_LEN,
  limit: MATERIAL_SUGGESTION_LIMIT,
};

/** 素材コードらしい形か（材種コード + 表面 + 直径 - 全長）。 */
const MATERIAL_CODE_RE = /^[A-Z]\d{2}[A-Z]\d{4}-[A-C]\d{3}-\d{3}$/i;

/** 素材コードの正規化（大文字化 + 空白除去）。完全一致の比較にだけ使う。 */
export function materialCodeKey(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** 突合に使う表記。 */
function materialKeys(m: MaterialMatchable): string[] {
  return [
    m.code,
    m.nameJa,
    m.nameEn,
    m.manufacturerModel,
    ...(m.keywords ?? []),
  ].filter((v): v is string => !!v);
}

const toCandidate = (h: {
  id: string;
  label: string;
  matchedKey: string;
  tier: MatchTier;
}): MaterialMatchCandidate => ({
  id: h.id,
  label: h.label,
  matchedKey: h.matchedKey,
  confidence: h.tier,
});

/**
 * 読み取ったコード・品名 → 素材。
 *
 * **コードの完全一致が最優先**（`code` 欄でも `text` 欄でも見る — 仕入先の
 * 書類は品名欄にコードを混ぜて刷ってくることがある）。当たれば `exact` で
 * 1 件に決まり、名前の突合は行わない。コードで決まらなければ、コードと品名の
 * 両方を読み取り文字列として段階的突合にかける。
 */
export function matchMaterial(
  code: string | null | undefined,
  text: string | null | undefined,
  pool: readonly MaterialMatchable[],
): MaterialMatchResult {
  const empty: MaterialMatchResult = { matched: null, candidates: [] };

  // 1. 素材コードの完全一致。書類にそのまま印字されるので、当たれば確実。
  for (const raw of [code, text]) {
    const key = raw?.trim();
    if (!key || !MATERIAL_CODE_RE.test(materialCodeKey(key))) continue;
    const wanted = materialCodeKey(key);
    const hit = pool.find((m) => m.code && materialCodeKey(m.code) === wanted);
    if (hit) {
      return {
        matched: {
          id: hit.id,
          label: hit.label,
          matchedKey: hit.code ?? key,
          confidence: "exact",
        },
        candidates: [],
      };
    }
  }

  const targets: MatchTarget[] = pool.map((m) => ({
    id: m.id,
    label: m.label,
    keys: materialKeys(m),
  }));

  // 2. 品名 → 段階的突合。決まらなければコード欄の文字列でもう一度試す
  //    （品名が空でコードだけ、という行がある）。
  for (const read of [text, code]) {
    if (!read?.trim()) continue;
    const r = matchText(read, targets, MATERIAL_RULES);
    if (r.matched) return { matched: toCandidate(r.matched), candidates: [] };
    if (r.candidates.length > 0) {
      return { matched: null, candidates: r.candidates.map(toCandidate) };
    }
  }
  return empty;
}
