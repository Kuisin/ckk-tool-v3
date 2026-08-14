/**
 * manual-source.ts — 公開ユーザーマニュアル（/manual）のコンテンツソース。
 *
 * 重要: 公開ルート（/manual 配下・検索・llms.txt）はこのファイルだけを
 * import する。internal-source.ts を import してはならない — 社内ドキュメントが
 * 公開インデックスへ混入するのを import 境界で防ぐ。
 */

import { loader } from "fumadocs-core/source";
import { manual } from "../../.source/server";
import { docsI18n } from "./docs-i18n";

export const manualSource = loader({
  baseUrl: "/manual",
  i18n: docsI18n,
  // 既定の /:lang/manual/… ではなく /manual/:lang/… に統一する
  // （proxy.ts の公開プレフィックスを manual 1 個で済ませるため）。
  url: (slugs, locale) => `/manual/${locale ?? "ja"}/${slugs.join("/")}`,
  source: manual.toFumadocsSource(),
});
