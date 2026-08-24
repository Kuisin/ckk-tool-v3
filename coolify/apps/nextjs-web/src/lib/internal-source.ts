/**
 * internal-source.ts — 社内ドキュメント（/internal-docs・要ログイン）のソース。
 *
 * これを import してよいのはセッション確認を行うルートだけ
 * （src/app/internal-docs/**）。公開ルートからの import は禁止。
 */

import { loader } from "fumadocs-core/source";
import { internal } from "../../.source/server";
import { docsI18n } from "./docs-i18n";

export const internalSource = loader({
  baseUrl: "/internal-docs",
  i18n: docsI18n,
  url: (slugs, locale) => `/internal-docs/${locale ?? "ja"}/${slugs.join("/")}`,
  source: internal.toFumadocsSource(),
});
