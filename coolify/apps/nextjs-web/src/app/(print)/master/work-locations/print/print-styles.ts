/**
 * print-styles.ts — 作業場所 QR ラベル印刷シートの CSS（page.tsx から分離）。
 *
 * kiosk-cards/print/print-styles.ts と同じ理由で分離・EXCLUDED 登録している
 * （CSS コメントが開いた template literal の中にあり、行内マーカーだと
 * CSS 本文へ混入する）。
 */

export function workLocationPrintStyles(dims: {
  pageWidthMm: number;
  pageHeightMm: number;
  marginXMm: number;
  marginYMm: number;
  cols: number;
  labelWidthMm: number;
  labelHeightMm: number;
}): string {
  const {
    pageWidthMm,
    pageHeightMm,
    marginXMm,
    marginYMm,
    cols,
    labelWidthMm,
    labelHeightMm,
  } = dims;
  return `
    /* ページサイズは必ず「長さ」で書く（絶対ページボックス = 縮小禁止）。 */
    @page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }

    .wl-print-root { background: #ffffff; color: #000000; }
    .wl-print-toolbar { padding: 16px; }
    .wl-print-empty { padding: 0 16px; color: #666666; font-size: 14px; }

    .wl-print-sheet {
      position: relative;
      box-sizing: border-box;
      width: ${pageWidthMm}mm;
      height: ${pageHeightMm}mm;
      padding: ${marginYMm}mm ${marginXMm}mm;
      margin: 0 auto;
      overflow: hidden;
      background: #ffffff;
    }
    .wl-print-sheet + .wl-print-sheet { break-before: page; }

    .wl-print-grid {
      display: grid;
      grid-template-columns: repeat(${cols}, ${labelWidthMm}mm);
      grid-auto-rows: ${labelHeightMm}mm;
    }
    .wl-print-cell {
      position: relative;
      width: ${labelWidthMm}mm;
      height: ${labelHeightMm}mm;
      break-inside: avoid;
    }
    .wl-print-label {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: 5mm;
      display: flex;
      gap: 4mm;
      align-items: center;
      overflow: hidden;
    }

    /* 十字トンボ（はさみ断裁の目印。SY08 と同じ描き方）。 */
    .wl-crop { position: absolute; width: 0; height: 0; }
    .wl-crop::before,
    .wl-crop::after { content: ""; position: absolute; background: #888888; }
    .wl-crop::before { width: 6mm; height: 0.2mm; left: -3mm; top: -0.1mm; }
    .wl-crop::after { width: 0.2mm; height: 6mm; left: -0.1mm; top: -3mm; }
    .wl-crop-tl { top: 0; left: 0; }
    .wl-crop-tr { top: 0; left: ${labelWidthMm}mm; }
    .wl-crop-bl { top: ${labelHeightMm}mm; left: 0; }
    .wl-crop-br { top: ${labelHeightMm}mm; left: ${labelWidthMm}mm; }

    .wl-print-scale {
      position: absolute;
      top: 12mm;
      left: ${marginXMm}mm;
      display: flex;
      align-items: center;
      gap: 2mm;
      color: #999999;
      font-size: 5pt;
      line-height: 1;
    }
    .wl-print-scale-bar {
      display: block;
      width: 50mm;
      height: 1.5mm;
      border-left: 0.2mm solid #999999;
      border-right: 0.2mm solid #999999;
      border-bottom: 0.2mm solid #999999;
    }

    .wl-print-qr { flex-shrink: 0; }
    .wl-print-qr svg { width: 40mm; height: 40mm; display: block; }
    .wl-print-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1.5mm;
    }
    .wl-print-group { font-size: 8pt; color: #444444; overflow-wrap: anywhere; }
    .wl-print-name { font-size: 14pt; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
    .wl-print-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9pt;
      color: #333333;
      overflow-wrap: anywhere;
    }
    .wl-print-hint { font-size: 5.5pt; color: #999999; }

    @media screen {
      .wl-print-root { background: #f1f3f5; padding-bottom: 24px; }
      .wl-print-sheet {
        box-shadow: 0 0 6px rgba(0, 0, 0, 0.25);
        margin-bottom: 16px;
      }
    }
    @media print {
      .wl-print-toolbar { display: none; }
      .wl-print-sheet { box-shadow: none; margin: 0 auto; }
    }
  `;
}
