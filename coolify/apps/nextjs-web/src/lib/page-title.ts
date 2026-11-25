/**
 * page-title.ts — 書類詳細ページの `generateMetadata` タイトル。
 *
 * ブラウザタブ・ブックマーク・未認証スクレイパの OG に出る「{書類種別} {番号} |
 * {アプリ名}」の組み立てを 1 か所へ集約する。書類種別のラベルは
 * `lib/app-list.ts` の `appLabelForKey`（ランチャーと同じ訳を再利用）——
 * ここで新たな訳を持たない。
 */

import { docNo } from "./doc-number";

/** アプリ名（固有名詞）。訳の対象外（_specs/i18n-glossary.md §1）。 */
export const APP_NAME = "CKK 業務管理システム"; // i18n-ignore

/**
 * `id` は URL の id（`CKK~QOT-2026-00001`）のままでよい — タイトルには番号だけを
 * 出す（法人コードは落とす）。番号の形でない id（ロット番号など）はそのまま。
 */
export function formatDocPageTitle(label: string, id: string): string {
  return `${label} ${docNo(id)} | ${APP_NAME}`;
}
