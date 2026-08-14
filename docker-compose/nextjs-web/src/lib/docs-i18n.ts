/**
 * docs-i18n.ts — fumadocs の i18n 設定（/manual・/internal-docs 共通）。
 *
 * 旧 /docs の ?lang= クエリ方式に代わり、URL セグメント方式
 * （/manual/ja/… /manual/en/… /manual/zh/…）を用いる。デフォルトは ja。
 * ファイル名は parser: "dot"（`page.md` = ja / `page.en.md` / `page.zh.md`）。
 */

import { defineI18n } from "fumadocs-core/i18n";

export const DOCS_LANGS = ["ja", "en", "zh"] as const;
export type DocLang = (typeof DOCS_LANGS)[number];

export function isDocLang(v: string | undefined): v is DocLang {
  return v === "ja" || v === "en" || v === "zh";
}

export const docsI18n = defineI18n({
  languages: [...DOCS_LANGS],
  defaultLanguage: "ja",
  parser: "dot",
  hideLocale: "never",
});
