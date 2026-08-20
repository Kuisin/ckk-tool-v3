/**
 * work-order-strip-sheet.ts — 指示書ストリップ（帯）印刷の寸法（mm）。
 *
 * ストリップ = 指示書 1 件ぶんの帯。最小限の要約 + QR だけを載せ、切り取って
 * 指示書の紙や部品箱に貼る。QR は統一形式 `CKK:WO:<指示書番号>`
 * （lib/qr-payload.ts）で、将来キオスクで読んで工程画面へ飛ぶための鍵。
 *
 * 用紙は**普通紙 A4**（専用ラベル不要）。180×40mm を 6 本、上下中央に並べる。
 *   横: (210 − 180) / 2 = 15mm ずつ
 *   縦: (297 − 40×6) / 2 = 28.5mm ずつ
 * 帯どうしは隙間なしで並べ、四隅に十字トンボを打って切り取り位置を示す。
 *
 * ★ 原寸の担保 — `@page { size: 210mm 297mm }` のように**長さで書いた
 *   ページサイズは絶対ページボックス**で、UA は用紙に合わせて拡大縮小しては
 *   ならない（CSS Paged Media）。`A4` などのキーワード指定は逆に "scalable" で
 *   縮小されうる。QR カード（lib/kiosk-card-sheet.ts）で同じ理由により
 *   キーワード指定をやめた経緯があるので、ここも必ず長さで書くこと。
 *
 *   ストリップに PDF 経路は用意していない（PDF はビューアの「印刷可能領域に
 *   合わせる」が支配して原寸を担保できない）。印刷はブラウザ印刷が唯一の経路。
 */

/** A4 実寸（mm）。 */
export const A4 = { width: 210, height: 297 } as const;

export const STRIP_SHEET = {
  /** 帯 1 本の寸法（mm）。 */
  stripWidth: 180,
  stripHeight: 40,
  /** 1 ページの本数。 */
  perPage: 6,
  /** 定位置の余白（mm）。上下は 6 本ぶんを中央に置いた残り半分。 */
  marginX: 15,
  marginY: 28.5,
  /** QR の一辺（mm）。現場のスキャナで確実に読める大きさを優先する。 */
  qrSize: 30,
} as const;

/** 指定件数を 1 ページ分ずつに切り分ける。 */
export function chunkForSheets<T>(items: readonly T[]): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += STRIP_SHEET.perPage) {
    pages.push(items.slice(i, i + STRIP_SHEET.perPage));
  }
  return pages;
}
