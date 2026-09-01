/**
 * i18n/index.ts — キオスクの in-house 多言語辞書（依存なし・isomorphic）。
 *
 * 対応言語は docs と同じ ja/en/zh。ユーザーの言語は users.locale に保存され、
 * QR ログイン後の UI（ランチャー以降）が I18nProvider 経由で参照する。
 * ログイン前の画面（/login, /setup, /device-error, /device-settings）は
 * 共有端末の既定として日本語固定。
 *
 * 使い方: サーバーページが <I18nProvider locale={session.locale}> で包み、
 * クライアントは const { m } = useI18n() で辞書を引く。変数を含む文言は
 * `fillMessage(m.xxx.yyy, { name: "..." })` で `{name}` の穴を埋める。
 *
 * ■ 文言の実体は JSON（2026-09 に .ts の関数値から移行）
 * 以前は `messages/{ja,en,zh}.ts` が文字列と「テンプレート関数」
 * （`greeting: (name) => \`${name} さん\`` のような値）を混在させて持っていた。
 * 関数は JSON で表現できないため Weblate（nextjs-web と同じ翻訳管理）に
 * 載せられず、キオスクの文言だけ人手の翻訳作業から外れていた。
 * `messages/*.json` へ移し、テンプレート関数は `{name}` 形の平文プレース
 * ホルダーへ書き換えた——`fillMessage()` が唯一の展開口。ICU は使わない
 * （依存を増やさない方針。nextjs-web は next-intl の ICU を使うが、こちらは
 * 独立した薄い辞書のまま）。
 *
 * 条件分岐を含んでいた 3 件（`自動判定: ${pass ? "合格" : "不合格"}` の形）は
 * プレースホルダーで表現できないため、呼び出し側が分岐して**別々の鍵**を選ぶ
 * 形に分けた: `autoVerdictPass`/`autoVerdictFail`、
 * `autoOverriddenPass`/`autoOverriddenFail`、
 * `samplingPercent`（件数なし）/`samplingPercentWithCount`（件数あり）。
 */

import en from "./messages/en.json";
import ja from "./messages/ja.json";
import zh from "./messages/zh.json";

export type KioskMessages = typeof ja;

export const LOCALES = ["ja", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

/** 切替 UI 用の言語自称ラベル（翻訳しない）。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  ja: "日本語",
  en: "EN",
  zh: "中文",
};

const MESSAGES: Record<Locale, KioskMessages> = {
  ja,
  en: en as KioskMessages,
  zh: zh as KioskMessages,
};

export function getMessages(locale: Locale): KioskMessages {
  return MESSAGES[locale] ?? ja;
}

/** DB 値など未検証の文字列を Locale に正規化（不明値は ja）。 */
export function normalizeLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "")
    ? (value as Locale)
    : "ja";
}

/**
 * 文中の `{name}` を埋める。穴が余っても足りなくても落とさない
 * （nextjs-web の旧 `lib/ui-text.ts` の `fill()` と同じ約束——訳が古くて
 * 穴の名前がずれていても、画面が壊れるより表示が少し変なほうがよい）。
 */
export function fillMessage(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}
