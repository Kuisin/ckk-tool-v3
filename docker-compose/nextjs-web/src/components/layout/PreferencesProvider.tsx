"use client";

/**
 * PreferencesProvider — ユーザーの表示設定（日付形式・時刻形式・タイムゾーン・
 * 言語）をクライアントへ配る Context。ダッシュボードのレイアウトが包む。
 *
 * **文言（翻訳）は next-intl** が配る（`useTranslations`）。ここが持つのは
 * 日時・{ja,en} フィールドの整形 — 日付の並び（YYYY/MM/DD 等）は Intl の
 * オプションで表現できず、next-intl のフォーマッタにも載らないため。
 *
 * サーバー側の値をそのまま props で受けるので、**SSR とハイドレーション後で
 * 同じ出力**になる（日時をクライアントでだけ整形すると 9 時間ずれた HTML が
 * 一瞬見えるうえ、hydration 不一致になる）。
 *
 * 使い方:
 *   const fmt = useFormat();              // fmt.date(...) / fmt.dateTime(...)
 *   const t = useTranslations("shell");   // ← 文言は next-intl から
 *
 * フックを使えない素の関数へは `Formatters` を引数で渡すこと（lib/format.ts）。
 */

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { createFormatters, type Formatters } from "@/lib/format";
import {
  DEFAULT_PREFERENCES,
  type DisplayPreferences,
} from "@/lib/user-preferences-core";

interface PreferencesValue {
  prefs: DisplayPreferences;
  fmt: Formatters;
}

function contextValue(prefs: DisplayPreferences): PreferencesValue {
  return { prefs, fmt: createFormatters(prefs) };
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
export function usePreferences(): DisplayPreferences {
  return useContext(PreferencesContext).prefs;
}

/** 日時・金額・{ja,en} の整形一式。 */
export function useFormat(): Formatters {
  return useContext(PreferencesContext).fmt;
}
