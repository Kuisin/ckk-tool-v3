/**
 * internal-source.ts — 管理マニュアル（/admin-manual・要ログイン）のソース。
 *
 * これを import してよいのはセッション確認を行うルートだけ
 * （src/app/admin-manual/**）。公開ルートからの import は禁止。
 */

import { loader } from "fumadocs-core/source";
import { internal } from "../../.source/server";
import { docsI18n } from "./docs-i18n";

export const internalSource = loader({
  baseUrl: "/admin-manual",
  i18n: docsI18n,
  url: (slugs, locale) => `/admin-manual/${locale ?? "ja"}/${slugs.join("/")}`,
  source: internal.toFumadocsSource(),
});
