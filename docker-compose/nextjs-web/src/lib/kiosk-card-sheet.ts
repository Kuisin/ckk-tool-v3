/**
 * kiosk-card-sheet.ts — QR カード印刷シート（SY08）の寸法（mm）。
 *
 * ここが原寸印刷の唯一の定義。Gotenberg へ渡す用紙サイズと、テンプレート
 * src/pdf-templates/kiosk-cards.html の CSS に差し込む値の両方をここから作る
 * （両者がずれるとページボックスとレイアウトが食い違い、原寸が崩れる）。
 *
 * カードは日本名刺サイズ 91×55mm 固定。A4 名刺用紙 10 面の定位置は左右 14mm /
 * 上下 11mm の余白（182 = 91×2、275 = 55×5）。
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

export const CARD_SHEET = {
  cardWidth: 91, // 日本名刺（変更しない）
  cardHeight: 55,
  cols: 2,
  rows: 5,
  marginX: 14, // A4 名刺用紙 10 面の定位置余白
  marginY: 11,
  safeInset: 6,
} as const;

/** A4 用紙 (210×297mm) から safeInset ぶん内側のページボックス。 */
export const CARD_SHEET_PAGE = {
  width: 210 - CARD_SHEET.safeInset * 2, // 198mm
  height: 297 - CARD_SHEET.safeInset * 2, // 285mm
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
