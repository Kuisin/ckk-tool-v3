/**
 * work-order-strip-print-styles.ts — 指示書ストリップ印刷面の CSS
 * （WorkOrderStripSheets.tsx から分離）。
 *
 * kiosk-cards/print/print-styles.ts と同じ理由で分離・EXCLUDED 登録している
 * （CSS コメントが開いた template literal の中にあり、行内マーカーだと
 * CSS 本文へ混入する）。
 */

export function workOrderStripPrintStyles(dims: {
  pageWidthMm: number;
  pageHeightMm: number;
  marginXMm: number;
  marginYMm: number;
  stripWidthMm: number;
  stripHeightMm: number;
  qrSizeMm: number;
}): string {
  const {
    pageWidthMm,
    pageHeightMm,
    marginXMm,
    marginYMm,
    stripWidthMm,
    stripHeightMm,
    qrSizeMm,
  } = dims;
  return `
    /*
     * ★ ページサイズは必ず「長さ」で書く（絶対ページボックス = 縮小禁止）。
     *   margin: 0 はブラウザの URL ヘッダー/フッターも抑止する。
     */
    @page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }

    .wo-strip-root { background: #ffffff; color: #000000; }
    .wo-strip-toolbar { padding: 16px; }
    .wo-strip-empty { padding: 0 16px; color: #666666; font-size: 14px; }

    .wo-strip-sheet {
      position: relative;
      box-sizing: border-box;
      width: ${pageWidthMm}mm;
      height: ${pageHeightMm}mm;
      padding: ${marginYMm}mm ${marginXMm}mm;
      margin: 0 auto;
      overflow: hidden;
      background: #ffffff;
    }
    .wo-strip-sheet + .wo-strip-sheet { break-before: page; }

    /* 原寸確認スケール — 上余白に置く（帯の外なので切り取ると消える）。 */
    .wo-strip-scale {
      position: absolute;
      top: 8mm;
      left: ${marginXMm}mm;
      display: flex;
      align-items: center;
      gap: 2mm;
    }
    .wo-strip-scale-bar {
      display: block;
      width: 50mm;
      height: 1.2mm;
      border: 0.2mm solid #000000;
      border-top: none;
      border-bottom: none;
      background:
        linear-gradient(#000, #000) left / 0.2mm 100% no-repeat,
        linear-gradient(#000, #000) right / 0.2mm 100% no-repeat,
        linear-gradient(#000, #000) center / 100% 0.2mm no-repeat;
    }
    .wo-strip-scale-label { font-size: 2.6mm; color: #666666; }

    .wo-strip-grid {
      display: grid;
      grid-template-columns: ${stripWidthMm}mm;
      grid-auto-rows: ${stripHeightMm}mm;
    }
    .wo-strip-cell {
      position: relative;
      width: ${stripWidthMm}mm;
      height: ${stripHeightMm}mm;
      break-inside: avoid;
    }

    /* 十字トンボ: 各隅の交点を中心に細い線を引く。 */
    .wo-crop {
      position: absolute;
      width: 4mm;
      height: 4mm;
      background:
        linear-gradient(#999, #999) center / 100% 0.2mm no-repeat,
        linear-gradient(#999, #999) center / 0.2mm 100% no-repeat;
    }
    .wo-crop-tl { top: -2mm; left: -2mm; }
    .wo-crop-tr { top: -2mm; right: -2mm; }
    .wo-crop-bl { bottom: -2mm; left: -2mm; }
    .wo-crop-br { bottom: -2mm; right: -2mm; }

    .wo-strip {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: 3mm 4mm;
      display: flex;
      gap: 4mm;
      align-items: center;
      border: 0.2mm dashed #cccccc; /* 切り取り線の目安 */
    }
    .wo-strip-qr { width: ${qrSizeMm}mm; height: ${qrSizeMm}mm; flex: none; }
    .wo-strip-qr svg { width: 100%; height: 100%; display: block; }

    .wo-strip-body {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1mm;
    }
    .wo-strip-head {
      display: flex;
      align-items: baseline;
      gap: 3mm;
    }
    .wo-strip-number {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 6mm;
      font-weight: 700;
      line-height: 1.1;
    }
    .wo-strip-type {
      font-size: 3mm;
      padding: 0.4mm 1.6mm;
      border: 0.2mm solid #000000;
      border-radius: 1mm;
    }
    .wo-strip-product {
      font-size: 4mm;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wo-strip-meta { display: flex; gap: 4mm; font-size: 3.2mm; }
    .wo-strip-order {
      font-size: 3.2mm;
      color: #444444;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media print {
      .wo-strip-toolbar { display: none !important; }
      .wo-strip-sheet { margin: 0; }
    }
  `;
}
