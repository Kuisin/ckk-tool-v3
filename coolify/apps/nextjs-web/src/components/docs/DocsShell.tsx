/**
 * DocsShell.tsx — fumadocs の RootProvider + DocsLayout 共通シェル。
 *
 * /manual（公開）と /admin-manual（要ログイン）の両レイアウトから使う。
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

/** 「アプリへ戻る」リンク文言 — 閲覧者の表示設定ではなく docs の言語（lang）で決まる。 */
const BACK_TO_APP_LABEL: Record<string, string> = {
  ja: "アプリへ戻る",
  en: "Back to the app",
  zh: "返回应用",
};

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
  /** もう一方のドキュメント（マニュアル ⇄ 管理マニュアル）へのリンク。 */
  crossLink?: { text: string; url: string };
  children: ReactNode;
}) {
  return (
    <DocsProvider i18nProps={provider(lang)} searchApi={searchApi}>
      <DocsLayout
        links={[
          ...(crossLink ? [crossLink] : []),
          {
            text: BACK_TO_APP_LABEL[lang] ?? BACK_TO_APP_LABEL.ja,
            url: "/",
          },
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
