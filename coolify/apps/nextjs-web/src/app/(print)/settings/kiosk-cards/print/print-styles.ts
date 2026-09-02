/**
 * print-styles.ts — QRカード印刷シートの CSS（page.tsx から分離）。
 *
 * 中身はほぼ全て CSS コメント（日本語の実装メモ）で、1 本の template
 * literal の中にある。行ごとに `i18n-ignore` を付けようとすると、コメントの
 * 直後にコード（CSS ルール）が続く行が多く、マーカーが対象の文字列の
 * 前後どちらの行にも乗らずに検知漏れになる — かといって開いた template
 * literal の途中へ雑にコメントを挿すと、そのまま CSS 本文に混入して印刷面が
 * 壊れる（trial-pricing-criteria-seed.ts と同じ罠）。CSS コメントは
 * ブラウザ・印刷どちらにも出力されない開発者向け文書なので、この 1 ファイルへ
 * 分離して `tools/i18n/lib/scan.mjs` の EXCLUDED に登録している
 * （inspection-template-io.ts / csv-export.ts と同じ「固定フォーマット・
 * 非UI」カテゴリ）。
 */

export function kioskCardPrintStyles(dims: {
  pageWidthMm: number;
  pageHeightMm: number;
  marginXMm: number;
  marginYMm: number;
  cols: number;
  cardWidthMm: number;
  cardHeightMm: number;
}): string {
  const {
    pageWidthMm,
    pageHeightMm,
    marginXMm,
    marginYMm,
    cols,
    cardWidthMm,
    cardHeightMm,
  } = dims;
  return `
    /*
     * ★ ページサイズは必ず「長さ」で書く（絶対ページボックス = 縮小禁止）。
     *   size: A4 のようなキーワードは "scalable" で縮小されうる。
     *   margin: 0 はブラウザの URL ヘッダー/フッターも抑止する。
     */
    @page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }

    .kiosk-print-root { background: #ffffff; color: #000000; }
    .kiosk-print-toolbar { padding: 16px; }
    .kiosk-print-empty { padding: 0 16px; color: #666666; font-size: 14px; }

    /* 1 シート = A4 1 ページ。余白は 10 面マルチカードの定位置。 */
    .kiosk-print-sheet {
      position: relative;
      box-sizing: border-box;
      width: ${pageWidthMm}mm;
      height: ${pageHeightMm}mm;
      padding: ${marginYMm}mm ${marginXMm}mm;
      margin: 0 auto;
      overflow: hidden;
      background: #ffffff;
    }
    .kiosk-print-sheet + .kiosk-print-sheet { break-before: page; }

    .kiosk-print-grid {
      display: grid;
      grid-template-columns: repeat(${cols}, ${cardWidthMm}mm);
      grid-auto-rows: ${cardHeightMm}mm;
    }
    .kiosk-print-cell {
      position: relative;
      width: ${cardWidthMm}mm;
      height: ${cardHeightMm}mm;
      break-inside: avoid;
    }
    .kiosk-print-card {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: 5mm 5mm 3.5mm;
      display: flex;
      gap: 4mm;
      align-items: center;
      position: relative;
      overflow: hidden;
    }

    /*
     * 十字トンボ: トリム線の交点（カードの角）を中心に、水平・垂直の線を
     * カード面へ重ねて描く（各方向 3mm = 全長 6mm、太さ 0.2mm）。
     * 隣接セルの十字は同一位置に重なるだけなので二重描画で問題ない。
     */
    .kiosk-crop { position: absolute; width: 0; height: 0; }
    .kiosk-crop::before,
    .kiosk-crop::after { content: ""; position: absolute; background: #888888; }
    .kiosk-crop::before { width: 6mm; height: 0.2mm; left: -3mm; top: -0.1mm; }
    .kiosk-crop::after { width: 0.2mm; height: 6mm; left: -0.1mm; top: -3mm; }
    .kiosk-crop-tl { top: 0; left: 0; }
    .kiosk-crop-tr { top: 0; left: ${cardWidthMm}mm; }
    .kiosk-crop-bl { top: ${cardHeightMm}mm; left: 0; }
    .kiosk-crop-br { top: ${cardHeightMm}mm; left: ${cardWidthMm}mm; }

    /* 原寸確認スケール — 上余白（断裁で捨てる帯）に薄く印字する。 */
    .kiosk-print-scale {
      position: absolute;
      top: 5.5mm;
      left: ${marginXMm}mm;
      display: flex;
      align-items: center;
      gap: 2mm;
      color: #999999;
      font-size: 5pt;
      line-height: 1;
    }
    .kiosk-print-scale-bar {
      display: block;
      width: 50mm;
      height: 1.5mm;
      border-left: 0.2mm solid #999999;
      border-right: 0.2mm solid #999999;
      border-bottom: 0.2mm solid #999999;
    }

    .kiosk-print-card-head {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2.5mm;
      min-width: 0;
    }
    .kiosk-print-company { font-size: 8pt; color: #444444; }
    .kiosk-print-user { font-size: 13pt; font-weight: 700; overflow-wrap: anywhere; }
    /* 未割当カード: 割当後に氏名を手書きする記名線 */
    .kiosk-print-user-line { display: block; height: 9mm; border-bottom: 0.35mm solid #333333; }
    /* カード識別 No.（SY08 一覧の表示末尾と一致 — 整理・照合用） */
    .kiosk-print-shortcode {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10pt;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .kiosk-print-qr { flex-shrink: 0; }
    .kiosk-print-qr svg { width: 36mm; height: 36mm; display: block; }
    .kiosk-print-id {
      position: absolute;
      right: 5mm;
      bottom: 2.5mm;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 6.5pt;
      color: #777777;
    }

    /* 画面では用紙の外形が分かるように影だけ足す（印刷では消す）。 */
    @media screen {
      .kiosk-print-root { background: #f1f3f5; padding-bottom: 24px; }
      .kiosk-print-sheet {
        box-shadow: 0 0 6px rgba(0, 0, 0, 0.25);
        margin-bottom: 16px;
      }
    }
    @media print {
      .kiosk-print-toolbar { display: none; }
      .kiosk-print-sheet { box-shadow: none; margin: 0 auto; }
    }
  `;
}
