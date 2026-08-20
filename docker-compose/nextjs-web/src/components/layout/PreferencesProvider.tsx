"use client";

/**
 * PreferencesProvider — ユーザーの表示設定（言語・日付・時刻・タイムゾーン）を
 * クライアントへ配る Context。ダッシュボードのレイアウトが包む。
 *
 * サーバー側の値をそのまま props で受けるので、**SSR とハイドレーション後で
 * 同じ出力**になる（日時をクライアントでだけ整形すると 9 時間ずれた HTML が
 * 一瞬見えるうえ、hydration 不一致になる）。
 *
 * 使い方:
 *   const fmt = useFormat();      // fmt.date(...) / fmt.dateTime(...)
 *   const { m, locale } = useI18n();
 *
 * フックを使えない素の関数へは `Formatters` を引数で渡すこと（lib/format.ts）。
 */

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { createFormatters, type Formatters } from "@/lib/format";
import { getMessages, type Locale, type WebMessages } from "@/lib/i18n";
import {
  DEFAULT_PREFERENCES,
  type DisplayPreferences,
} from "@/lib/user-preferences-core";

interface PreferencesValue {
  prefs: DisplayPreferences;
  fmt: Formatters;
  m: WebMessages;
  locale: Locale;
}

function contextValue(prefs: DisplayPreferences): PreferencesValue {
  return {
    prefs,
    fmt: createFormatters(prefs),
    m: getMessages(prefs.locale),
    locale: prefs.locale,
  };
}

// 既定値（日本語 / JST）— Provider の外で使われても落ちないように。
const PreferencesContext = createContext<PreferencesValue>(
  contextValue(DEFAULT_PREFERENCES),
);

export function PreferencesProvider({
  prefs,
  children,
}: {
  prefs: DisplayPreferences;
  children: ReactNode;
}) {
  const value = useMemo(() => contextValue(prefs), [prefs]);
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

/** 表示設定そのもの（設定画面など）。 */
export function usePreferences(): PreferencesValue {
  return useContext(PreferencesContext);
}

/** 日時・金額・{ja,en} の整形一式。 */
export function useFormat(): Formatters {
  return useContext(PreferencesContext).fmt;
}

/** UI 文言と現在の言語。 */
export function useI18n(): { m: WebMessages; locale: Locale } {
  const { m, locale } = useContext(PreferencesContext);
  return { m, locale };
}
