/**
 * ui-text.ts — 画面文言を **日本語そのものを鍵にして** 訳す層。
 *
 * ■ なぜ next-intl の名前付きキーではないのか
 * 残っている画面文言は約 6,200 語ある。これに `messages/*.json` のキーを
 * 付けて回ると、2 つの問題がそのまま残る:
 *
 *   1. **6,200 個のキー名を発明することになる。** 名前を考える作業が翻訳より
 *      重く、しかも `saveFailed` / `couldNotSave` のような揺れが必ず出る。
 *   2. **同じ日本語に 2 つの訳が付く余地が残る。** 用語集の芯は
 *      「表にある ja に、表と違う訳を当てない」で、これは *ja が同じなら訳も
 *      同じ* という規則。キーを介すと、同じ「保存に失敗しました」が別々の
 *      キーで別々に訳されうる。実際 `_specs/i18n-glossary.md` の表でも
 *      訳の割れが起きていて、`tools/i18n/i18n-glossary-check.mjs` を足した。
 *
 * ja を鍵にすると、2 は**構造的に起こらない** — 同じ日本語は必ず同じ訳を引く。
 * 1 も消える。用語集の規則を型と辞書で表しただけ、という位置づけ。
 *
 * ■ next-intl は捨てていない
 * 既に移した枠（`common` / `shell` / `preferences` / `home` / `loginHistory`）は
 * そのまま next-intl が持つ。あちらは **変数と複数形を含む文**（`{name} の詳細を
 * 開く`）が要る場所で、ICU が要る。こちらは**変数の無い決まり文句**専用。
 * 変数が要るものを ja 鍵で持たないこと — 文を連結することになり、語順が
 * 言語で変わって壊れる（用語集 §2.6）。
 *
 * ■ 訳が無いときは日本語のまま
 * `translate` は辞書に無ければ鍵（= 日本語）をそのまま返す。つまり ja は常に
 * 恒等で、**訳の抜けが画面を壊すことはない**。移行途中でも動くという既存の
 * 約束（`src/i18n/request.ts`）をそのまま引き継ぐ。
 */

import type { Locale } from "./i18n";
import { en } from "./ui-dictionary/en";
import { zh } from "./ui-dictionary/zh";

/** ja を鍵にした対訳表。ja は恒等なので表を持たない。 */
const DICTIONARIES: Record<Exclude<Locale, "ja">, Record<string, string>> = {
  en,
  zh,
};

/**
 * 日本語の文言を `locale` の訳に置き換える。**辞書に無ければ日本語のまま。**
 *
 * フックを使えない素の関数用。React の中からは `useTr()` /
 * `getTr()` を使うこと（毎回 locale を引き回さずに済む）。
 */
export function translate(ja: string, locale: Locale): string {
  if (locale === "ja") return ja;
  return DICTIONARIES[locale]?.[ja] ?? ja;
}

/** 辞書に載っているか（未訳の洗い出し用。画面では使わない）。 */
export function hasTranslation(ja: string, locale: Exclude<Locale, "ja">) {
  return Object.hasOwn(DICTIONARIES[locale], ja);
}

/**
 * locale を束ねた翻訳関数。
 *
 * `undefined` / `null` をそのまま通すのは、**Server Action の
 * `ActionResult.error` をそのまま包めるようにする**ため。エラー文言は
 * サーバー側（`lib/*.ts` や `actions.ts`）で日本語のまま作られ、画面で
 * 表示するときに訳す — ja を鍵にしているからできる「後から訳す」形で、
 * これのおかげでサーバー側の全関数に locale を引き回さずに済む。
 */
export interface Translate {
  (ja: string): string;
  (ja: string | null | undefined): string | undefined;
}

/** `translate` を locale で束ねた関数を作る。 */
export function createTranslate(locale: Locale): Translate {
  return ((ja: string | null | undefined) =>
    ja == null ? undefined : translate(ja, locale)) as Translate;
}
