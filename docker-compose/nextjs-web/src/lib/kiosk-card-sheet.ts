/**
 * kiosk-card-sheet.ts — QR カード印刷シート（SY08）の寸法（mm）。
 *
 * ここが原寸印刷の唯一の定義。印刷ページ（HTML）の CSS、Gotenberg へ渡す
 * 用紙サイズ、テンプレート src/pdf-templates/kiosk-cards.html の CSS を
 * すべてここから作る（ずれるとページボックスとレイアウトが食い違い、原寸が
 * 崩れる）。
 *
 * カードは日本名刺サイズ 91×55mm 固定。A4 名刺用紙 10 面の定位置は左右 14mm /
 * 上下 11mm の余白（182 = 91×2、275 = 55×5）。
 *
 * ★ 印刷経路は 2 つあり、原寸の担保の仕方が違う。
 *
 * 1. **ブラウザ印刷（主経路）** — /settings/kiosk-cards/print。CSS の
 *    `@page { size: <length>{2} }` は **絶対ページボックス**で、UA は用紙に
 *    合わせて拡大縮小してはならない（`A4` などのキーワード指定は逆に
 *    "scalable" ＝ 縮小されうる。旧実装はこれで縮んでいた）。
 *    したがってページボックスは A4 実寸をそのまま mm で宣言する。
 *
 * 2. **PDF（保存・配布用）** — /api/pdf/kiosk-cards。PDF になった時点で CSS の
 *    絶対指定は効かず、ビューアの「印刷可能領域に合わせる」が支配する。
 *    そちらは CARD_SHEET_PAGE のとおりページボックスを一回り小さく取って
 *    縮小そのものを起こさせない（下記）。
 *
 * ★ ページボックスは A4 そのものではなく、A4 から四方 `safeInset` mm 内側に
 *   取る。PDF ビューアの既定「印刷可能領域に合わせる」（Chrome の PDF ビューア
 *   の既定動作、macOS プレビューの「用紙に合わせる」も同様）は、ページボックス
 *   が印刷可能領域より大きいときだけ縮小する。A4 ちょうどのページボックスだと
 *   プリンタの非印字マージン（3〜6mm）ぶん必ず ≈96% に縮み、カードは
 *   約 87×53mm、下段では 10mm 以上ずれる。一回り小さく取れば倍率は 1.0 の
 *   まま = 常に原寸。
 *
 * 位置が保たれる理由: ページは用紙中央に置かれ、10 面の余白は上下・左右とも
 * 対称なので、内側に取った分だけ padding を減らせばカードは定位置に戻る
 * （padding = 定位置余白 − safeInset）。この対称性が前提なので、余白が非対称な
 * 用紙に合わせる場合はこの式ごと見直すこと。
 *
 * safeInset = 6mm は一般的なレーザー / インクジェットの非印字マージン
 * （≈3〜6mm）を包含する。これを超えるプリンタでも縮小はその差分ぶん
 * （1% 未満）に留まる。
 */

/** A4 実寸（mm）。`@page` へは必ずこの数値を length で書く（キーワード不可）。 */
export const A4 = { width: 210, height: 297 } as const;

export const CARD_SHEET = {
  cardWidth: 91, // 日本名刺（変更しない）
  cardHeight: 55,
  cols: 2,
  rows: 5,
  marginX: 14, // A4 名刺用紙 10 面の定位置余白
  marginY: 11,
  safeInset: 6,
} as const;

/** PDF 用: A4 から safeInset ぶん内側のページボックス（ビューアの縮小対策）。 */
export const CARD_SHEET_PAGE = {
  width: A4.width - CARD_SHEET.safeInset * 2, // 198mm
  height: A4.height - CARD_SHEET.safeInset * 2, // 285mm
  padX: CARD_SHEET.marginX - CARD_SHEET.safeInset, // 8mm
  padY: CARD_SHEET.marginY - CARD_SHEET.safeInset, // 5mm
} as const;

/** 1 ページあたりのカード枚数（2 列 × 5 行 = 10）。 */
export const CARDS_PER_PAGE = CARD_SHEET.cols * CARD_SHEET.rows;

/** テンプレート kiosk-cards.html の `{{…}}` へ差し込む寸法一式。 */
export function cardSheetTemplateVars(): Record<string, number> {
  return {
    pageWidth: CARD_SHEET_PAGE.width,
    pageHeight: CARD_SHEET_PAGE.height,
    padX: CARD_SHEET_PAGE.padX,
    padY: CARD_SHEET_PAGE.padY,
    cardWidth: CARD_SHEET.cardWidth,
    cardHeight: CARD_SHEET.cardHeight,
    cols: CARD_SHEET.cols,
    safeInset: CARD_SHEET.safeInset,
  };
}
