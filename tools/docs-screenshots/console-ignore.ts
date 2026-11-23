/**
 * console-ignore.ts — 試験環境で常に出る、コードの欠陥ではない console.error。
 *
 * page-load.spec.ts（全画面の読み込み確認）と walkthroughs.spec.ts（業務の通し操作）が
 * 同じ一覧を見る。片方だけ直すと、同じノイズで片方だけ落ちる。
 */

/** データ由来・外部サービス由来で常に出る既知のノイズ。 */
export const IGNORE_CONSOLE = [
  "/api/avatars/", // デモユーザーの写真ファイルが無い（データ）
  "favicon",
  "Download the React DevTools",
  "Geolocation",
  // 外部サービス由来 — この試験の環境には無い。詳細画面が iframe で先読みする
  // PDF（Gotenberg → 502）と、オブジェクトストレージの実体（SeaweedFS → 404:
  // 取込元 PDF・設計図データ）。画面自体は描けていて、無いのはレンダラと
  // ストレージ。
  "/api/pdf/",
  "/api/intake/source/",
  "/api/design-files/",
];

/** その console.error を無視してよいか（本文か発生元 URL のどちらかが一致）。 */
export function isIgnoredConsole(text: string, where: string): boolean {
  return IGNORE_CONSOLE.some((s) => text.includes(s) || where.includes(s));
}
