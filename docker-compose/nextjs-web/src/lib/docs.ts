import "server-only";

/**
 * docs.ts — /docs マニュアルのツリー定義と Markdown 読み出し.
 *
 * コンテンツは `src/content/docs/<slug>/<lang>.md`（lang = ja|en|zh）。
 * フォルダ構造がページ構成を表し、ファイル名が言語を表す。ランタイムで fs 読み
 * 出しするため next.config.ts の outputFileTracingIncludes に含める。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderMarkdown } from "./markdown";

export const DOCS_LANGS = ["ja", "en", "zh"] as const;
export type DocLang = (typeof DOCS_LANGS)[number];

export const DOC_LANG_LABEL: Record<DocLang, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
};

export function isDocLang(v: string | undefined): v is DocLang {
  return v === "ja" || v === "en" || v === "zh";
}

export interface DocPage {
  /** フォルダパス（= ページの slug）。 */
  slug: string;
  title: Record<DocLang, string>;
}

export interface DocSection {
  title: Record<DocLang, string>;
  pages: DocPage[];
}

/** マニュアル構成（セクション → ページ）。フォルダ構造と一致。 */
export const DOCS_TREE: DocSection[] = [
  {
    title: { ja: "はじめに", en: "Getting Started", zh: "入门" },
    pages: [
      {
        slug: "start",
        title: {
          ja: "スタートマニュアル",
          en: "Start Manual",
          zh: "开始手册",
        },
      },
      {
        slug: "user-settings",
        title: {
          ja: "ユーザー設定マニュアル",
          en: "User Settings Manual",
          zh: "用户设置手册",
        },
      },
    ],
  },
  {
    title: {
      ja: "アプリ操作マニュアル",
      en: "App User Guides",
      zh: "应用操作手册",
    },
    pages: [
      {
        slug: "apps/trial-estimate/user",
        title: {
          ja: "試算 — 操作マニュアル",
          en: "Trial Estimate — User Manual",
          zh: "试算 — 操作手册",
        },
      },
      {
        slug: "apps/price-list/user",
        title: {
          ja: "価格表 — 操作マニュアル",
          en: "Price List — User Manual",
          zh: "价格表 — 操作手册",
        },
      },
      {
        slug: "apps/quote/user",
        title: {
          ja: "見積書 — 操作マニュアル",
          en: "Quote — User Manual",
          zh: "报价单 — 操作手册",
        },
      },
    ],
  },
  {
    title: {
      ja: "アプリ設定マニュアル",
      en: "App Settings Guides",
      zh: "应用设置手册",
    },
    pages: [
      {
        slug: "apps/trial-estimate/settings",
        title: {
          ja: "試算 — 設定マニュアル",
          en: "Trial Estimate — Settings Manual",
          zh: "试算 — 设置手册",
        },
      },
      {
        slug: "apps/price-list/settings",
        title: {
          ja: "価格表 — 設定マニュアル",
          en: "Price List — Settings Manual",
          zh: "价格表 — 设置手册",
        },
      },
      {
        slug: "apps/quote/settings",
        title: {
          ja: "見積書 — 設定マニュアル",
          en: "Quote — Settings Manual",
          zh: "报价单 — 设置手册",
        },
      },
    ],
  },
];

const ALL_PAGES: DocPage[] = DOCS_TREE.flatMap((s) => s.pages);

export function findDocPage(slug: string): DocPage | undefined {
  return ALL_PAGES.find((p) => p.slug === slug);
}

const DOCS_DIR = path.join(process.cwd(), "src", "content", "docs");

export interface DocContent {
  page: DocPage;
  /** 実際に読めた言語（要求言語が無ければ ja→en の順でフォールバック）。 */
  lang: DocLang;
  html: string;
}

/** slug + lang の Markdown を HTML で返す。見つからなければ null。 */
export async function readDoc(
  slug: string,
  lang: DocLang,
): Promise<DocContent | null> {
  const page = findDocPage(slug);
  if (!page) return null;
  const base = path.join(DOCS_DIR, ...slug.split("/"));
  const order: DocLang[] = [lang, "ja", "en"];
  for (const l of order) {
    try {
      const md = await readFile(path.join(base, `${l}.md`), "utf8");
      return { page, lang: l, html: renderMarkdown(md) };
    } catch {
      // try next fallback language
    }
  }
  return null;
}
