/**
 * DocsShell.tsx — fumadocs の RootProvider + DocsLayout 共通シェル。
 *
 * /manual（公開）と /internal-docs（要ログイン）の両レイアウトから使う。
 * テーマ切替は無効（ライト固定）— アプリ本体は Mantine の
 * data-mantine-color-scheme で dark: variant を制御しており、fumadocs の
 * next-themes による <html> クラス切替と衝突するため。
 * RootProvider 本体は DocsProvider（'use client'）— 言語切替 URL
 * （/manual/<lang>/…）の置換に onLocaleChange が必要なため。
 */

import type { Root as PageTreeRoot } from "fumadocs-core/page-tree";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  LanguageSelect,
  LanguageSelectText,
} from "fumadocs-ui/layouts/shared/slots/language-select";
import type { ReactNode } from "react";
import { docsI18n } from "@/lib/docs-i18n";
import { DocsProvider } from "./DocsProvider";

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
  crossLink,
  children,
}: {
  lang: string;
  tree: PageTreeRoot;
  title: string;
  searchApi: string;
  /** もう一方のドキュメント（マニュアル ⇄ 社内ドキュメント）へのリンク。 */
  crossLink?: { text: string; url: string };
  children: ReactNode;
}) {
  return (
    <DocsProvider i18nProps={provider(lang)} searchApi={searchApi}>
      <DocsLayout
        links={[
          ...(crossLink ? [crossLink] : []),
          { text: "アプリへ戻る", url: "/" },
        ]}
        nav={{ title }}
        sidebar={{
          // v16 の DocsLayout は言語スイッチャを自動では出さない —
          // サイドバー下部に明示的に置く（onChange は DocsProvider が処理）。
          footer: (
            <LanguageSelect>
              <LanguageSelectText />
            </LanguageSelect>
          ),
        }}
        tree={tree}
      >
        {children}
      </DocsLayout>
    </DocsProvider>
  );
}
