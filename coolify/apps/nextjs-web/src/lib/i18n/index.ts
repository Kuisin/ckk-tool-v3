/**
 * i18n/index.ts — 対応言語の定義（isomorphic・依存なし）。
 *
 * **文言そのものは next-intl が持つ**（messages/<locale>.json + src/i18n/request.ts）。
 * ここに残すのは「どの言語があるか」「DB の値をどう正規化するか」「Intl に
 * 渡すタグは何か」だけ — これらは lib/format.ts や表示設定の正規化からも
 * 使うため、next-intl に依存しない素の値として置いておく。
 *
 * 対応言語は docs・キオスクと同じ ja/en/zh。ユーザーの言語は
 * **app.users.locale**（キオスクと共有の 1 列）に入る。変更は
 * /profile/preferences（Web）またはキオスクのランチャー。
 *
 * 使い方（next-intl）:
 *   - サーバー: `const t = await getTranslations("shell")`
 *   - クライアント: `const t = useTranslations("shell")`
 * まだ移していない画面は日本語の直書きのまま動く（壊れない）。
 */

export const LOCALES = ["ja", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

/** 切替 UI 用の言語自称ラベル（翻訳しない）。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
};

/** DB 値など未検証の文字列を Locale に正規化（不明値は ja）。 */
export function normalizeLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "")
    ? (value as Locale)
    : "ja";
}

/**
 * Intl 用の BCP 47 タグ。日付・数値の並びはここで決まる
 * （画面文言の言語とは別物なので、切り離して持つ）。
 */
export const INTL_LOCALES: Record<Locale, string> = {
  ja: "ja-JP",
  en: "en-US",
  zh: "zh-CN",
};

/**
 * DB の多言語 JSON（`{ ja, en, ... }` — キーは言語コード。`_specs/i18n-glossary.md`
 * §2.10）を表示するときの読み替え順。**ja は必ず持つ**という約束のほかは、
 * どの言語キーが埋まっているかはレコードごとに違う（後から言語を足せる
 * 可変キー設計のため）ので、「無ければ次はどれを見るか」をここで決める。
 *
 * zh → en を優先するのは、日本語より英語の方が読める可能性が高いという
 * 判断（zh データがまだ無い移行期間の既定動作）。新しい言語を足すときは
 * ここに 1 行足すだけでよい — 型・フォーム側は LOCALES を見て自動で追従する。
 */
export const LOCALE_FALLBACK: Record<Locale, readonly Locale[]> = {
  ja: ["ja"],
  en: ["en", "ja"],
  zh: ["zh", "en", "ja"],
};

/** 未知の言語コードに対する既定の読み替え順（新言語を LOCALE_FALLBACK に足す前でも壊れない）。 */
export function localeFallbackOrder(locale: string): readonly string[] {
  return LOCALE_FALLBACK[locale as Locale] ?? [locale, "ja"];
}
