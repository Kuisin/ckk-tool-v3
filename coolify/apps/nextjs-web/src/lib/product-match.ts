/**
 * product-match.ts — AI が読み取った品名から製品を引き当てる。純ロジック。
 *
 * 取引先（lib/bp-match）と同じ問題だが、事情がひとつ違う: **製品マスタは大きい**
 * （数万件を見込む）。取引先のように全件を JS へ持ってきて突合する、はできない。
 *
 * そこで 2 段構えにする:
 *   1. ここが作る「探し方」（searchProbes）で **DB に候補を出させる**
 *      — 具体的な probe から順に、当たったらそこで止める（無駄に広く引かない）
 *   2. 返ってきた候補だけを lib/text-match の段階的突合にかけて決める
 *
 * 品名の印字は寸法や仕様が後ろに続くことが多い（`〜カッター φ8.3×330`）。
 * これは「登録名が読み取りの頭から一致」= prefix 段で拾える。逆に略記
 * （`ザグリカッター` だけ）は partial 段 = **候補止まり**で、人が選ぶ。
 *
 * 取引先より頭から一致の最小長を長く取っている（4 文字）。製品名は
 * `超硬ソリッド…` のように長い共通部分を持つ同族が多く、短い一致で自動確定
 * させると別の製品を掴むため。誤った製品は誤った顧客より下流（指示書・出荷）
 * まで響く。
 *
 * 照合の材料は名称だけではない。**キーワード**（products.match_names — マスタ
 * MS04 の「キーワード」欄）も同じ段階で当てる。名称は 1 つしか持てないのに
 * 相手はいろいろな呼び方で書いてくるので、そのための欄がある。
 */

import { searchKey } from "./bp-search";
import { toKatakana } from "./company-aliases";
import {
  type MatchTarget,
  type MatchTier,
  matchText,
  type TextMatchRules,
} from "./text-match";

/** 突合対象の製品 1 件。 */
export interface ProductMatchable {
  id: string;
  /** 画面表示用（名称 + 製品コード）。 */
  label: string;
  nameJa?: string | null;
  nameEn?: string | null;
  /** 製品コード PRD-YYYYMM-NNNN（未採番は null）。 */
  code?: string | null;
  /** 旧システムの識別子。注文書に相手の品番として印字されることがある。 */
  legacyKey?: string | null;
  /**
   * キーワード（products.match_names — マスタ MS04 の「キーワード」欄）。
   * 相手の呼び方・略称・英字表記など、**名称欄には入れられない別表記**。
   * 名称と同じ段階（完全 → 正規化 → 頭から → 一部）で評価する。
   */
  keywords?: readonly string[] | null;
}

export interface ProductMatchCandidate {
  id: string;
  label: string;
  /** 当たった登録側の表記。 */
  matchedKey: string;
  confidence: MatchTier;
}

export interface ProductMatchResult {
  matched: ProductMatchCandidate | null;
  candidates: ProductMatchCandidate[];
}

/** 画面に出す候補の上限。 */
export const PRODUCT_SUGGESTION_LIMIT = 5;

/**
 * 頭から一致・一部一致に使ってよい最小長。取引先（2）より長い —
 * 上のコメントのとおり、製品は共通部分が長いので短い一致では決めない。
 */
const MIN_LEN = 4;

/**
 * 突合用の正規化キー。searchKey（NFKC・大文字化・空白と記号の除去）に、
 * 品名で揺れる**寸法まわりの記号**の除去とかな寄せを足す。
 * `φ8.3×330` `Φ8.3x330` `φ 8.3 X 330` を同じ鍵にする。
 */
export function productMatchKey(raw: string): string {
  return (
    toKatakana(searchKey(raw))
      // 直径記号は書いたり書かなかったりする（φ8.3 / 8.3）。searchKey が
      // 大文字化したあとなので大文字の異体字だけを見ればよい。
      .replace(/[ΦФ⌀Ø]/g, "")
      // 寸法の区切り（8.3×330 / 8.3x330 / 8.3*330 / 8.3/330）。
      // **数字に挟まれたときだけ**落とす — `XT100` の X を消さないため。
      .replace(/(\d)[×✕✖X＊*/／]+(\d)/g, "$1$2")
  );
}

const PRODUCT_RULES: TextMatchRules = {
  normalize: productMatchKey,
  minPrefixLen: MIN_LEN,
  minPartialLen: MIN_LEN,
  limit: PRODUCT_SUGGESTION_LIMIT,
};

/**
 * DB に投げる「探し方」を具体的な順に返す（前方一致 LIKE ではなく部分一致）。
 *
 *   1. 読み取り全体          — 登録名が読み取りを丸ごと含む（略記で書かれた）
 *   2. 先頭 N 文字（長→短）  — 登録名の頭が読み取りの頭と同じ（寸法などが後続）
 *
 * 呼び出し側は**この順に 1 つずつ引き**、決まった時点で止める。広い probe を
 * 常に投げると、大きなマスタでは無関係な行で上限が埋まってしまう。
 */
export function searchProbes(read: string): string[] {
  const base = read.trim();
  if (!base) return [];
  const probes = [base];
  // 記号や空白の前で切ると「名前らしい頭」になりやすい。
  const head = base.split(/[\s/／・,、（(]/)[0] ?? "";
  if (head.length >= MIN_LEN && head !== base) probes.push(head);
  for (const n of [12, 8, MIN_LEN]) {
    const slice = base.slice(0, n);
    if (slice.length >= MIN_LEN) probes.push(slice);
  }
  return [...new Set(probes)];
}

/** 突合に使う表記。 */
function productKeys(p: ProductMatchable): string[] {
  return [
    p.nameJa,
    p.nameEn,
    p.code,
    p.legacyKey,
    ...(p.keywords ?? []),
  ].filter((v): v is string => !!v);
}

/**
 * 読み取った品名 → 製品。候補は呼び出し側が DB から絞って渡す（searchProbes）。
 */
export function matchProductName(
  read: string | null | undefined,
  pool: ProductMatchable[],
): ProductMatchResult {
  const targets: MatchTarget[] = pool.map((p) => ({
    id: p.id,
    label: p.label,
    keys: productKeys(p),
  }));
  const r = matchText(read, targets, PRODUCT_RULES);
  const toCandidate = (h: {
    id: string;
    label: string;
    matchedKey: string;
    tier: MatchTier;
  }): ProductMatchCandidate => ({
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
