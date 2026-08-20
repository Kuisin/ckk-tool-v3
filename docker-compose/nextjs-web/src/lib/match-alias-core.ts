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

/** 学習対象のマスタ（テーブル名 — audit と同じ多態規約）。 */
export type MatchAliasTarget = "business_partners" | "products";

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

/** 対象ごとの正規化（突合で使うものと同じ関数を使う — ずれると引けない）。 */
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
  /** 突合済みの製品 id（未突合は null）。 */
  productId: string | null;
}

/**
 * 保存の前後を突き合わせて、学習すべき組を返す。
 *
 * 対象は「**人が結び付けた**」もの:
 *  - 顧客: 保存後に顧客が入っていて、保存前と違う（未特定 → 特定 / 付け替え）
 *  - 明細: その品名に対する製品が、保存前と違う（未特定 → 特定 / 付け替え）
 *
 * 明細は保存のたびに作り直される（id が変わる）ので、**品名で突き合わせる**。
 * 同じ品名の行が複数あって別々の製品に結ばれている書類は、どちらを覚えるべきか
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

  // 品名 → 保存前の製品（同じ品名が別の製品に結ばれていたら曖昧なので捨てる）。
  const beforeByText = indexByText(input.items.before);
  const afterByText = indexByText(input.items.after);
  for (const [text, productId] of afterByText) {
    if (productId == null) continue; // まだ未突合の行
    if (beforeByText.get(text) === productId) continue; // 人が触っていない
    const learning = aliasLearning("products", productId, text);
    if (learning) out.push(learning);
  }
  return out;
}

const AMBIGUOUS = Symbol("ambiguous");

/**
 * 品名 → 製品 id の索引。同じ品名が別の製品に結ばれていたら、その品名は
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
    if (seen === undefined) map.set(text, it.productId);
    else if (seen !== it.productId) map.set(text, AMBIGUOUS);
  }
  const out = new Map<string, string | null | undefined>();
  for (const [text, v] of map) {
    if (v !== AMBIGUOUS) out.set(text, v);
  }
  return out;
}
