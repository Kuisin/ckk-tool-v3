/**
 * messages.ts — **文言はすべて `messages/<locale>.json` にある。**
 * コードの中に訳を持たない。この 1 本がその唯一の読み口。
 *
 * ■ どうしてこうしたか
 * 以前は訳が 3 か所に分かれていた:
 *   1. `messages/*.json`（next-intl）
 *   2. `Record<Locale, string>`（`enum-labels.ts` などコードの中）
 *   3. ja を鍵にした辞書（`lib/ui-dictionary/*.ts` — 生成物）
 * 置き場が 3 通りあると「どこに足すか」を毎回考えることになり、翻訳を人に
 * 頼むときも 3 種類の形式を渡すことになる。**言語ファイル 1 本**に寄せて、
 * コード側は引くだけにした（Weblate に渡せるのもこの形だけ）。
 *
 * ■ 名前空間の作り
 *   common / shell / preferences / …  変数を含む文。next-intl が ICU で処理する
 *   enum / status / permission / …    値に付くラベル（入れ子）
 *   ui                                変数の無い決まり文句。**鍵は日本語の原文**
 *
 * ■ `ui` だけ平らな理由
 * 鍵が日本語の原文そのもので、44 件は `直径は 0.1〜99.9mm…` のように **`.` を
 * 含む**。next-intl の `t("a.b")` は `.` を入れ子の区切りとして読むので、
 * `t()` では引けない。ここは**直接プロパティを引く**ので `.` も改行も安全。
 *
 * ■ 3 言語ぶんを静的に読み込んでいる
 * `useTr()` は `NextIntlClientProvider` の**外**（`not-found` / 取引先ポータル /
 * フォームの公開ページ）でも動く必要がある。Provider の context から取ると
 * そこで例外になるので、モジュールとして持つ。移行前の
 * `lib/ui-dictionary/{en,zh}.ts` も同じく静的 import だったので、
 * クライアントに載る量は変わっていない。
 */

import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import zh from "../../messages/zh.json";
import type { Locale } from "./i18n";

type MessageTree = Record<string, unknown>;

const TREES: Record<Locale, MessageTree> = {
  ja: ja as MessageTree,
  en: en as MessageTree,
  zh: zh as MessageTree,
};

/** `messages/ja.json` 全体。next-intl の `getRequestConfig` が使う。 */
export function messagesFor(locale: Locale): MessageTree {
  return TREES[locale] ?? TREES.ja;
}

/** `a.b.c` を辿る。無ければ undefined。 */
function walk(tree: MessageTree, dotted: string): unknown {
  let node: unknown = tree;
  for (const part of dotted.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * 値に付くラベルを引く（`enum` / `status` / `permission` / …）。
 *
 * **訳が無ければ ja → `fallback` の順に倒す。** 新しい enum 値が増えても
 * 画面が空白にならない（移行前の `resolveLabel` と同じ約束）。
 */
export function label(dotted: string, locale: Locale, fallback = ""): string {
  const hit = walk(TREES[locale] ?? TREES.ja, dotted);
  if (typeof hit === "string") return hit;
  const jaHit = walk(TREES.ja, dotted);
  return typeof jaHit === "string" ? jaHit : fallback;
}

/**
 * ある名前空間の直下を `{ value, label }` の一覧にする（Select の選択肢用）。
 * 並びは **ja の並び順**に固定する — 言語で選択肢の順番が変わらないように。
 */
export function labelOptions(
  dotted: string,
  locale: Locale,
): { value: string; label: string }[] {
  const jaNode = walk(TREES.ja, dotted);
  if (!jaNode || typeof jaNode !== "object") return [];
  return Object.keys(jaNode as Record<string, unknown>).map((value) => ({
    value,
    label: label(`${dotted}.${value}`, locale, value),
  }));
}

/**
 * その名前空間の直下の鍵を **ja の並び順で**返す。
 * 「順序だけが要る」呼び出し元（カタログの並び）向け。
 */
export function labelKeys(dotted: string): string[] {
  const jaNode = walk(TREES.ja, dotted);
  if (!jaNode || typeof jaNode !== "object") return [];
  return Object.keys(jaNode as Record<string, unknown>);
}

/**
 * 穴（`{name}`）を埋めながらラベルを引く。
 *
 * ICU は通さない。帳票のラベルには `消費税（10%）` のように **`%` や括弧が
 * そのまま入る**うえ、正規表現の例（`^[A-Z]{2}-d{4}$`）まである。ICU に渡すと
 * これらを書式指定として読もうとして壊れるので、素朴な置換に留める。
 * 複数形や性差が要る文は next-intl 側（`common` などの名前空間）で扱う。
 */
export function labelWith(
  dotted: string,
  locale: Locale,
  vars: Record<string, unknown>,
): string {
  return label(dotted, locale).replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name] ?? "") : whole,
  );
}

/**
 * 1 つの鍵を `{ ja, en, zh }` の形で返す。
 *
 * 呼び出し元が「言語ごとの値の束」をそのまま扱っている場所
 * （`PERMISSION_GROUP_LABEL[group].ja` のような読み方）向け。**訳の実体は
 * JSON にあり、ここは形を合わせているだけ**。
 */
export function localizedLabel(dotted: string): Record<Locale, string> {
  return {
    ja: label(dotted, "ja"),
    en: label(dotted, "en"),
    zh: label(dotted, "zh"),
  };
}

/**
 * 名前空間の直下をまるごと `{ 鍵: { ja, en, zh } }` にする。
 * コードから表の実体を消しても、呼び出し元の読み方を変えずに済む。
 */
export function localizedMap<K extends string = string>(
  dotted: string,
): Record<K, Record<Locale, string>> {
  const out = {} as Record<K, Record<Locale, string>>;
  for (const key of labelKeys(dotted)) {
    out[key as K] = localizedLabel(`${dotted}.${key}`);
  }
  return out;
}

/** その名前空間に鍵があるか（未知の値かどうかの判定用）。 */
export function hasLabel(dotted: string): boolean {
  return typeof walk(TREES.ja, dotted) === "string";
}

/**
 * 変数の無い決まり文句（`ui` 名前空間）。**鍵は日本語の原文そのもの。**
 * 辞書に無ければ日本語のまま返すので、訳の抜けが画面を壊さない。
 */
export function uiText(jaText: string, locale: Locale): string {
  if (locale === "ja") return jaText;
  const table = (TREES[locale] ?? TREES.ja).ui;
  if (!table || typeof table !== "object") return jaText;
  const hit = (table as Record<string, unknown>)[jaText];
  return typeof hit === "string" ? hit : jaText;
}

/** `ui` に載っているか（未訳の洗い出し用。画面では使わない）。 */
export function hasUiText(jaText: string, locale: Exclude<Locale, "ja">) {
  const table = TREES[locale]?.ui;
  return Boolean(
    table && typeof table === "object" && jaText in (table as object),
  );
}
