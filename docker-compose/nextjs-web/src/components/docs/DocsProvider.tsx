"use client";

/**
 * DocsProvider.tsx — fumadocs RootProvider のクライアントラッパー。
 *
 * 言語切替の URL 差し替えを自前で行う: fumadocs 既定の onChange は
 * 「ロケール = 先頭セグメント（/ja/…）」前提で、当アプリの
 * /manual/<lang>/… には合わず /en/manual/ja/… を生成してしまう。
 * ここで 2 番目のセグメント（["", "manual", "ja", …]）を置換する。
 * onLocaleChange は関数なのでサーバー側 DocsShell からは渡せない —
 * この 'use client' ラッパーが必要な理由。
 */

import type { I18nProviderProps } from "fumadocs-ui/contexts/i18n";
import { RootProvider } from "fumadocs-ui/provider/next";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function DocsProvider({
  i18nProps,
  searchApi,
  children,
}: {
  /** defineI18nUI(...).provider(lang) の戻り値（プレーンなデータのみ）。 */
  i18nProps: I18nProviderProps;
  searchApi: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <RootProvider
      i18n={{
        ...i18nProps,
        onLocaleChange: (locale) => {
          // 例: /manual/ja/apps/quote/user → ["", "manual", "ja", …]
          const segments = pathname.split("/");
          if (segments.length >= 3) {
            segments[2] = locale;
            router.push(segments.join("/"));
          }
        },
      }}
      search={{ options: { api: searchApi } }}
      theme={{ enabled: false }}
    >
      {children}
    </RootProvider>
  );
}
