/**
 * pdf-print-prefs.ts — PDF に印刷ビューア設定（ViewerPreferences）を追記する。
 *
 * ブラウザ/OS の印刷ダイアログは既定で「用紙に合わせて縮小」や US Letter を
 * 選ぶことがあり、QR カードのようなミリ単位レイアウトでは位置・サイズが
 * ずれる。PDF 仕様の ViewerPreferences で
 *   - /PrintScaling /None      … 原寸（100%）で印刷（フチなし前提の配置を維持）
 *   - /PickTrayByPDFSize       … 用紙サイズを PDF のページサイズから選択
 * を宣言すると、対応ビューア（Acrobat / Chromium / macOS プレビュー等）の
 * 印刷ダイアログ既定値がそれに従う。
 *
 * `pickTrayByPdfSize` はページボックスが実在の用紙サイズと一致する帳票でのみ
 * true にする。QR カードシートのようにページボックスを用紙より小さく取る
 * （＝縮小を封じる）帳票は **false** — 存在しない用紙を探させず、プリンタの
 * 既定用紙（日本なら A4）にそのまま原寸で載せる。
 *
 * Gotenberg（Chromium/Skia）の出力は PDF 1.4 + 平文カタログ + 旧式 xref
 * テーブルなので、既存バイトを一切変更しない「増分更新」（updated catalog +
 * 追記 xref + trailer /Prev）で安全に付加できる。解析に失敗した場合は
 * 元の PDF をそのまま返す（印刷設定はベストエフォート）。
 *
 * 依存なし（lockfile 凍結のため PDF ライブラリは追加しない）。バイト列は
 * latin1 文字列として 1:1 で往復させる。
 */

/** `<<` から対応する `>>` までの辞書テキストを返す（ネスト対応）。 */
function extractDict(s: string, start: number): string | null {
  if (s.slice(start, start + 2) !== "<<") return null;
  let depth = 0;
  for (let i = start; i < s.length - 1; i++) {
    const pair = s.slice(i, i + 2);
    if (pair === "<<") {
      depth++;
      i++;
    } else if (pair === ">>") {
      depth--;
      i++;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export interface PrintPreferencesOptions {
  /** /PickTrayByPDFSize の値（既定 true）。上のコメント参照。 */
  pickTrayByPdfSize?: boolean;
}

/**
 * ViewerPreferences（/PrintScaling /None + /PickTrayByPDFSize）を
 * 増分更新で追記した PDF を返す。解析できない構造（xref ストリーム等）や
 * 既に ViewerPreferences を持つ PDF は元のバイト列をそのまま返す。
 */
export function withPrintPreferences(
  pdf: ArrayBuffer,
  options: PrintPreferencesOptions = {},
): ArrayBuffer {
  const original = Buffer.from(pdf);
  const s = original.toString("latin1");

  // 最終 trailer 辞書（/Size /Root /Info …）と直前の startxref オフセット
  const trailerAt = s.lastIndexOf("trailer");
  const startxrefAt = s.lastIndexOf("startxref");
  if (trailerAt < 0 || startxrefAt < 0) return pdf;
  const trailerDictStart = s.indexOf("<<", trailerAt);
  if (trailerDictStart < 0) return pdf;
  const trailerDict = extractDict(s, trailerDictStart);
  if (!trailerDict) return pdf;
  const prevXref = Number.parseInt(
    s.slice(startxrefAt + "startxref".length).trim(),
    10,
  );
  if (!Number.isInteger(prevXref)) return pdf;

  const rootMatch = trailerDict.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
  if (!rootMatch) return pdf;
  const rootNum = Number(rootMatch[1]);
  const rootGen = Number(rootMatch[2]);

  // カタログ本体 `<num> <gen> obj <<...>>` を探す
  const objHeader = `${rootNum} ${rootGen} obj`;
  const objAt = s.lastIndexOf(objHeader);
  if (objAt < 0) return pdf;
  const catDictStart = s.indexOf("<<", objAt);
  if (catDictStart < 0) return pdf;
  const catDict = extractDict(s, catDictStart);
  if (!catDict || !catDict.includes("/Catalog")) return pdf;
  if (catDict.includes("/PrintScaling")) return pdf; // 既に設定済み

  const pickTray = options.pickTrayByPdfSize ?? true;
  const PREFS = `/PrintScaling/None/PickTrayByPDFSize ${pickTray}`;
  let updatedCatalog: string;
  const vpKeyAt = catDict.indexOf("/ViewerPreferences");
  if (vpKeyAt >= 0) {
    // 既存の ViewerPreferences 辞書（Chromium は /DisplayDocTitle 等を出力
    // する）へマージ。間接参照（N 0 R）の場合は解析を諦めて原本を返す。
    const vpDictStart = catDict.indexOf("<<", vpKeyAt);
    if (vpDictStart < 0) return pdf;
    const between = catDict
      .slice(vpKeyAt + "/ViewerPreferences".length, vpDictStart)
      .trim();
    if (between !== "") return pdf; // `<<` の前に値がある = 間接参照など
    const vpDict = extractDict(catDict, vpDictStart);
    if (!vpDict) return pdf;
    const mergedVp = `${vpDict.slice(0, -2)}${PREFS}>>`;
    updatedCatalog =
      catDict.slice(0, vpDictStart) +
      mergedVp +
      catDict.slice(vpDictStart + vpDict.length);
  } else {
    // ViewerPreferences が無い場合: カタログの閉じ >> の直前に丸ごと挿入
    updatedCatalog = `${catDict.slice(0, -2)}/ViewerPreferences <<${PREFS}>>>>`;
  }

  // 増分更新の組み立て（既存バイトは不変 — 追記のみ）
  const objOffset = original.length + 1; // 先頭の "\n" の直後
  let appended = `\n${objHeader}\n${updatedCatalog}\nendobj\n`;
  const xrefOffset = original.length + appended.length;
  const entry = `${String(objOffset).padStart(10, "0")} ${String(rootGen).padStart(5, "0")} n \n`;
  // 元 trailer の内容（Size/Root/Info/ID）を引き継ぎ /Prev を追加
  const newTrailer = `${trailerDict.slice(0, -2)}/Prev ${prevXref}>>`;
  appended += `xref\n${rootNum} 1\n${entry}trailer\n${newTrailer}\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const out = Buffer.concat([original, Buffer.from(appended, "latin1")]);
  // Buffer はプール共有のことがあるので、自身の範囲だけを ArrayBuffer 化する
  return out.buffer.slice(
    out.byteOffset,
    out.byteOffset + out.byteLength,
  ) as ArrayBuffer;
}
