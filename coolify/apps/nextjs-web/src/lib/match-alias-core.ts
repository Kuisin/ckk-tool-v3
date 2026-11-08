/**
 * match-alias-core.ts — 学習した照合名（app.match_aliases）の判定。純ロジック。
 *
 * 取込の突合が外れると、人が画面で正しい取引先・製品を選ぶ。その 1 回の判断を
 * 捨てずに貯めておけば、同じ書式の書類が次に来たときは自動で当たる
 * （同じ相手が毎月同じ様式で送ってくるのが実態なので、効きやすい）。
 *
 * ここが決めるのは「**何を学習するか**」だけ。書き込みは lib/match-aliases、
 * 突合での使い方は lib/intake が持つ。
 *
 * 学習するのは**人が結び直したときだけ**。自動で当たった分まで貯めても、
 * 既に当たっているので何も増えない（行だけ増える）。逆に、間違った候補を
 * 選んでしまった場合も、後で直せば **1 表記 = 1 マスタ** の規則でその行が
 * 移る（最後の訂正が勝つ — lib/match-aliases の upsert）。
 */

import { bpMatchKey } from "./bp-match";
import { productMatchKey } from "./product-match";

/**
 * 学習対象のマスタ（テーブル名 — audit と同じ多態規約）。
 *
 * 品目統合 第 3 段で `products` / `materials` を **`items` 1 つ**に畳んだ。
 * 製品も素材も 1 つの品目マスタになったので、学習の行き先も 1 つで足りる。
 * 正規化はもともと両方 `productMatchKey` を共用していた（素材コードと素材名は
 * 製品名と同じ揺れ方 — 寸法記号・全角半角 — をするため）ので、畳んでも
 * 同じ表記が 2 通りの鍵に落ちることはない。
 *
 * **1 表記 = 1 マスタ**（unique(target_type, alias_key)）なので、製品と素材で
 * 同じ表記を別々に覚えることはできなくなった。ただし害は無い —
 * 突合側は引いた品目の `itemType` を必ず確かめる（販売側は PRODUCT、購買側は
 * MATERIAL のプール）ので、相手の型の学習が当たっても素通りして推測へ落ちる。
 *
 * **値の集合は DB 側の CHECK（match_aliases_target_type_check）と揃えること。**
 * 揃っていないと INSERT が弾かれ、`saveAliasLearnings` の try/catch が握り潰す
 * ので誰も気づかない — `materials` を足したときに実際そうなっていた（CHECK を
 * 広げ忘れたまま購買側の学習を書いていたので、**素材の学習は 1 件も保存されて
 * いなかった**）。`match-alias-target-guard.test.ts` がこの 2 つを突き合わせる。
 */
export const MATCH_ALIAS_TARGETS = ["business_partners", "items"] as const;

export type MatchAliasTarget = (typeof MATCH_ALIAS_TARGETS)[number];

/** 学習する 1 件。 */
export interface AliasLearning {
  targetType: MatchAliasTarget;
  /** マスタ行の内部 id（文字列）。 */
  targetId: string;
  /** 書類に印字されていた表記（そのまま保存する）。 */
  alias: string;
  /** 突合用の正規化キー。 */
  aliasKey: string;
}

/**
 * 短すぎる表記は学習しない。「A」「1」のような断片に 1 社・1 製品を割り当てると、
 * 以後まったく別の書類がそれで自動確定してしまう。
 */
const MIN_ALIAS_LEN = 2;

/**
 * 対象ごとの正規化（突合で使うものと同じ関数を使う — ずれると引けない）。
 * 品目（製品・素材）はどちらも `productMatchKey`（lib/product-match /
 * lib/material-match が同じ鍵で突合する）。
 */
export function aliasKeyFor(targetType: MatchAliasTarget, raw: string): string {
  return targetType === "business_partners"
    ? bpMatchKey(raw)
    : productMatchKey(raw);
}

/** 1 件ぶんの学習を組み立てる（学習に値しなければ null）。 */
export function aliasLearning(
  targetType: MatchAliasTarget,
  targetId: string | null | undefined,
  rawAlias: string | null | undefined,
): AliasLearning | null {
  const id = targetId?.trim();
  const alias = rawAlias?.trim();
  if (!id || !alias || alias.length < MIN_ALIAS_LEN) return null;
  const aliasKey = aliasKeyFor(targetType, alias);
  if (aliasKey.length < MIN_ALIAS_LEN) return null;
  return { targetType, targetId: id, alias, aliasKey };
}

/** 明細 1 行のうち、学習に関係する部分。 */
export interface AliasItemState {
  /** 抽出された品名（印字されたまま）。 */
  productText: string | null;
  /** 突合済みの品目 id（**items.id**。未突合は null）。 */
  itemId: string | null;
}

/**
 * 保存の前後を突き合わせて、学習すべき組を返す。
 *
 * 対象は「**人が結び付けた**」もの:
 *  - 顧客: 保存後に顧客が入っていて、保存前と違う（未特定 → 特定 / 付け替え）
 *  - 明細: その品名に対する品目が、保存前と違う（未特定 → 特定 / 付け替え）
 *
 * 明細は保存のたびに作り直される（id が変わる）ので、**品名で突き合わせる**。
 * 同じ品名の行が複数あって別々の品目に結ばれている書類は、どちらを覚えるべきか
 * 決められないので**学習しない**（曖昧なものを覚えると害の方が大きい）。
 */
export function aliasLearnings(input: {
  /** 抽出された顧客名（印字されたまま）。手入力なら null。 */
  extractedCustomerName: string | null;
  customer: { before: string | null; after: string | null };
  items: { before: AliasItemState[]; after: AliasItemState[] };
}): AliasLearning[] {
  const out: AliasLearning[] = [];

  const { before: cBefore, after: cAfter } = input.customer;
  if (cAfter && cAfter !== cBefore) {
    const learning = aliasLearning(
      "business_partners",
      cAfter,
      input.extractedCustomerName,
    );
    if (learning) out.push(learning);
  }

  // 品名 → 保存前の品目（同じ品名が別の品目に結ばれていたら曖昧なので捨てる）。
  const beforeByText = indexByText(input.items.before);
  const afterByText = indexByText(input.items.after);
  for (const [text, itemId] of afterByText) {
    if (itemId == null) continue; // まだ未突合の行
    if (beforeByText.get(text) === itemId) continue; // 人が触っていない
    const learning = aliasLearning("items", itemId, text);
    if (learning) out.push(learning);
  }
  return out;
}

const AMBIGUOUS = Symbol("ambiguous");

/**
 * 品名 → 品目 id の索引。同じ品名が別の品目に結ばれていたら、その品名は
 * 覚えない（undefined を返して比較から外す）。
 */
function indexByText(
  items: readonly AliasItemState[],
): Map<string, string | null | undefined> {
  const map = new Map<string, string | null | typeof AMBIGUOUS | undefined>();
  for (const it of items) {
    const text = it.productText?.trim();
    if (!text) continue;
    const seen = map.get(text);
    if (seen === undefined) map.set(text, it.itemId);
    else if (seen !== it.itemId) map.set(text, AMBIGUOUS);
  }
  const out = new Map<string, string | null | undefined>();
  for (const [text, v] of map) {
    if (v !== AMBIGUOUS) out.set(text, v);
  }
  return out;
}
