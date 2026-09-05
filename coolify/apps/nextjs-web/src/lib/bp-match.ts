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
 * 引けない、という状態だったので、段階的な突合（lib/text-match）に置き換える。
 *
 * ここが持つのは**取引先に固有の規則**だけ — 法人格の開き方・落とし方と、
 * 宛名の敬称。段の定義と自動確定の可否は lib/text-match が持つ。
 */

import { type BpSearchable, searchKey } from "./bp-search";
import { toKatakana } from "./company-aliases";
import {
  type MatchTarget,
  type MatchTier,
  matchText,
  type TextMatchRules,
} from "./text-match";

/** 突合の当たり方（lib/text-match の段）。 */
export type BpMatchConfidence = MatchTier;

/** 突合対象の取引先 1 件。 */
export interface BpMatchable extends BpSearchable {
  id: string;
  /** 画面表示用の名称（通常は名称 ja）。 */
  label: string;
  /**
   * その場面で期待されるロール（顧客 / 仕入先）を持つか。**自動で**欄へ
   * 入れてよいのはそのロールを持つ取引先だけ（ピッカーが出すのも同じ集合）。
   * 別のロールしか持たない取引先が当たった場合は候補に留める。
   *
   * 既定は true（未指定 = 制約なし）。注文請書は顧客ロール、購買側の取込は
   * 仕入先ロールを期待する — プールを作る側（lib/intake の
   * `loadBpMatchPool(role)`）が決める。
   */
  hasExpectedRole?: boolean;
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

/** 宛名の敬称。書類には社名の後ろに必ず付いてくるので落とす。 */
const HONORIFICS = /(御中|様|殿|各位)\s*$/u;

/**
 * `(株)` `（株）` `㈱` を `株式会社` に開く。**searchKey にかける前**に行う —
 * searchKey は括弧を落とすので、先に開かないと `(株)` が裸の `株` になり、
 * `有沢製作所` の `有` のような社名の一部と見分けが付かなくなる。
 * （`㈱` は NFKC で `(株)` になるので、この 1 本で両方を拾う）
 */
/**
 * 法人格の表記そのもの（company-aliases.ts LEGAL_FORMS と同分類）。
 * 突合ロジックの入力であって UI 文言ではない。
 */
function expandLegalMarks(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[(（]\s*株\s*[)）]/g, "株式会社") // i18n-ignore
    .replace(/[(（]\s*有\s*[)）]/g, "有限会社") // i18n-ignore
    .replace(/[(（]\s*同\s*[)）]/g, "合同会社"); // i18n-ignore
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

const BP_RULES: TextMatchRules = {
  normalize: bpMatchKey,
  core: bpCoreKey,
  variants: (read) => {
    const base = read.trim();
    return [base, base.replace(HONORIFICS, "").trim()];
  },
  minPrefixLen: MIN_PREFIX_LEN,
  limit: SUGGESTION_LIMIT,
};

/** 突合に使う表記（別名・読み・コードまで全部）。 */
function bpKeys(bp: BpMatchable): string[] {
  return [
    bp.nameJa,
    bp.nameEn,
    bp.nameKana,
    bp.shortName,
    bp.bpCode,
    ...(bp.matchNames ?? []),
    ...(bp.matchNamesAuto ?? []),
  ].filter((v): v is string => !!v);
}

/**
 * 読み取った社名 → 取引先。プールは呼び出し側が用意する
 * （有効な取引先は数百件なので、全件を渡して JS で判定して十分）。
 */
export function matchBusinessPartnerName(
  read: string | null | undefined,
  pool: BpMatchable[],
): BpMatchResult {
  const targets: MatchTarget[] = pool.map((bp) => ({
    id: bp.id,
    label: bp.label,
    keys: bpKeys(bp),
    autoConfirmable: bp.hasExpectedRole !== false,
  }));
  const r = matchText(read, targets, BP_RULES);
  const toCandidate = (h: {
    id: string;
    label: string;
    matchedKey: string;
    tier: MatchTier;
  }): BpMatchCandidate => ({
    id: h.id,
    label: h.label,
    matchedKey: h.matchedKey,
    confidence: h.tier,
  });
  return {
    matched: r.matched ? toCandidate(r.matched) : null,
    candidates: r.candidates.map(toCandidate),
  };
}
