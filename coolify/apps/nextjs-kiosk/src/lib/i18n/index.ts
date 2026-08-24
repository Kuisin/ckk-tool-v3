/**
 * i18n/index.ts — キオスクの in-house 多言語辞書（依存なし・isomorphic）。
 *
 * 対応言語は docs と同じ ja/en/zh。ユーザーの言語は users.locale に保存され、
 * QR ログイン後の UI（ランチャー以降）が I18nProvider 経由で参照する。
 * ログイン前の画面（/login, /setup, /device-error, /device-settings）は
 * 共有端末の既定として日本語固定。
 *
 * 使い方: サーバーページが <I18nProvider locale={session.locale}> で包み、
 * クライアントは const { m } = useI18n() で辞書を引く。
 */

import { en } from "./messages/en";
import { ja, type KioskMessages } from "./messages/ja";
import { zh } from "./messages/zh";

export type { KioskMessages };

export const LOCALES = ["ja", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

/** 切替 UI 用の言語自称ラベル（翻訳しない）。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  ja: "日本語",
  en: "EN",
  zh: "中文",
};

const MESSAGES: Record<Locale, KioskMessages> = { ja, en, zh };

export function getMessages(locale: Locale): KioskMessages {
  return MESSAGES[locale] ?? ja;
}

/** DB 値など未検証の文字列を Locale に正規化（不明値は ja）。 */
export function normalizeLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "")
    ? (value as Locale)
    : "ja";
}
