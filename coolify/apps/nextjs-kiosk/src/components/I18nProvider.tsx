"use client";

/**
 * I18nProvider — ユーザー言語の辞書をクライアントへ配る Context。
 * サーバーページが session.locale を渡して包む（lib/i18n/index.ts 参照）。
 */

import { createContext, type ReactNode, useContext } from "react";
import { getMessages, type KioskMessages, type Locale } from "@/lib/i18n";

type I18nValue = { locale: Locale; m: KioskMessages };

const I18nContext = createContext<I18nValue>({
  locale: "ja",
  m: getMessages("ja"),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, m: getMessages(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
