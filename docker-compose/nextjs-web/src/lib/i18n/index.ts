/**
 * i18n/index.ts — アプリ本体の in-house 多言語辞書（依存なし・isomorphic）。
 *
 * キオスク（nextjs-kiosk/src/lib/i18n）と同じ作りで、外部 i18n ライブラリは
 * 使わない（lockfile 凍結。next-intl は未導入）。対応言語は docs・キオスクと
 * 同じ ja/en/zh。
 *
 * ユーザーの言語は **app.users.locale**（キオスクと共有の 1 列）に入る。
 * つまり同じ人が Web でもタブレットでも同じ言語で使える。変更は
 * /profile/preferences（Web）またはキオスクのランチャー。
 *
 * 使い方:
 *   - サーバー: `const m = await getServerMessages()`
 *   - クライアント: `const { m, locale } = useI18n()`
 *     （PreferencesProvider がダッシュボード全体を包んでいる）
 *
 * 文言を足すときは **ja.ts に足してから** en/zh を埋める。`WebMessages` は
 * `typeof ja` なので、埋め忘れはコンパイルエラーになる。
 */

import { en } from "./messages/en";
import { ja, type WebMessages } from "./messages/ja";
import { zh } from "./messages/zh";

export type { WebMessages };

export const LOCALES = ["ja", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

/** 切替 UI 用の言語自称ラベル（翻訳しない）。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
};

const MESSAGES: Record<Locale, WebMessages> = { ja, en, zh };

export function getMessages(locale: Locale): WebMessages {
  return MESSAGES[locale] ?? ja;
}

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
