/**
 * DocsShell.tsx — fumadocs の RootProvider + DocsLayout 共通シェル。
 *
 * /manual（公開）と /internal-docs（要ログイン）の両レイアウトから使う。
 * テーマ切替は無効（ライト固定）— アプリ本体は Mantine の
 * data-mantine-color-scheme で dark: variant を制御しており、fumadocs の
 * next-themes による <html> クラス切替と衝突するため。
 */

import type { Root as PageTreeRoot } from "fumadocs-core/page-tree";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { docsI18n } from "@/lib/docs-i18n";

const { provider } = defineI18nUI(docsI18n, {
  ja: { displayName: "日本語" },
  en: { displayName: "English" },
  zh: { displayName: "中文" },
});

export function DocsShell({
  lang,
  tree,
  title,
  searchApi,
  children,
}: {
  lang: string;
  tree: PageTreeRoot;
  title: string;
  searchApi: string;
  children: ReactNode;
}) {
  return (
    <RootProvider
      i18n={provider(lang)}
      search={{ options: { api: searchApi } }}
      theme={{ enabled: false }}
    >
      <DocsLayout
        links={[{ text: "アプリへ戻る", url: "/" }]}
        nav={{ title }}
        tree={tree}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
