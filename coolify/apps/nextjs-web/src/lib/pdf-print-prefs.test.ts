/**
 * pdf-print-prefs.test.ts — ViewerPreferences 増分更新のユニットテスト。
 * Chromium/Skia 出力（PDF 1.4 + 平文カタログ + 旧式 xref）を模した
 * 最小 PDF に対して、追記の構造と非破壊性を検証する。
 */

import { describe, expect, it } from "vitest";
import { withPrintPreferences } from "./pdf-print-prefs";

/** Chromium 出力と同型の最小 PDF（オブジェクト位置は本物どおりでなくてよい）。 */
function minimalPdf(): string {
  return [
    "%PDF-1.4",
    "1 0 obj",
    "<</Type /Catalog /Pages 2 0 R>>",
    "endobj",
    "2 0 obj",
    "<</Type /Pages /Kids [3 0 R] /Count 1>>",
    "endobj",
    "3 0 obj",
    "<</Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89]>>",
    "endobj",
    "xref",
    "0 4",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000056 00000 n ",
    "0000000109 00000 n ",
    "trailer",
    "<</Size 4 /Root 1 0 R>>",
    "startxref",
    "180",
    "%%EOF",
  ].join("\n");
}

const toArrayBuffer = (s: string): ArrayBuffer => {
  const b = Buffer.from(s, "latin1");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const toStr = (ab: ArrayBuffer): string => Buffer.from(ab).toString("latin1");

describe("withPrintPreferences", () => {
  it("増分更新で ViewerPreferences を追記する（既存バイトは不変）", () => {
    const src = minimalPdf();
    const out = toStr(withPrintPreferences(toArrayBuffer(src)));
    // 元バイト列がそのまま先頭に残る（増分更新）
    expect(out.startsWith(src)).toBe(true);
    // 更新カタログに印刷設定が入る
    expect(out).toContain("/PrintScaling/None");
    expect(out).toContain("/PickTrayByPDFSize true");
    expect(out).toContain("/Prev 180");
    expect(out.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("追記された xref のオフセットが更新カタログの位置を指す", () => {
    const src = minimalPdf();
    const out = toStr(withPrintPreferences(toArrayBuffer(src)));
    const appended = out.slice(src.length);
    const entry = appended.match(/xref\n1 1\n(\d{10}) 00000 n /);
    expect(entry).not.toBeNull();
    const offset = Number(entry?.[1]);
    expect(out.slice(offset, offset + "1 0 obj".length)).toBe("1 0 obj");
    // startxref は追記 xref の位置を指す
    const sx = appended.match(/startxref\n(\d+)\n%%EOF/);
    expect(sx).not.toBeNull();
    expect(out.slice(Number(sx?.[1]), Number(sx?.[1]) + 4)).toBe("xref");
  });

  it("既存の ViewerPreferences 辞書へマージする（Chromium 実出力の形）", () => {
    const src = minimalPdf().replace(
      "<</Type /Catalog /Pages 2 0 R>>",
      "<</Type /Catalog /Pages 2 0 R /ViewerPreferences <</Type /ViewerPreferences\n/DisplayDocTitle true>>>>",
    );
    const out = toStr(withPrintPreferences(toArrayBuffer(src)));
    expect(out.startsWith(src)).toBe(true);
    const appended = out.slice(src.length);
    // 既存キーを保持したまま印刷設定が同じ辞書に入る（新規辞書は作らない）
    expect(appended).toContain(
      "/DisplayDocTitle true/PrintScaling/None/PickTrayByPDFSize true",
    );
    expect(appended.match(/\/PrintScaling/g)).toHaveLength(1);
  });

  it("pickTrayByPdfSize: false で /PickTrayByPDFSize false を書く", () => {
    const src = minimalPdf();
    const out = toStr(
      withPrintPreferences(toArrayBuffer(src), { pickTrayByPdfSize: false }),
    );
    // 原寸固定は維持しつつ、用紙はプリンタ既定（A4）に任せる
    expect(out).toContain("/PrintScaling/None/PickTrayByPDFSize false");
  });

  it("既に /PrintScaling を持つ PDF はそのまま返す", () => {
    const src = minimalPdf().replace(
      "<</Type /Catalog /Pages 2 0 R>>",
      "<</Type /Catalog /Pages 2 0 R /ViewerPreferences <</PrintScaling/None>>>>",
    );
    const ab = toArrayBuffer(src);
    expect(toStr(withPrintPreferences(ab))).toBe(src);
  });

  it("ViewerPreferences が間接参照の場合は原本を返す（安全側）", () => {
    const src = minimalPdf().replace(
      "<</Type /Catalog /Pages 2 0 R>>",
      "<</Type /Catalog /Pages 2 0 R /ViewerPreferences 9 0 R>>",
    );
    const ab = toArrayBuffer(src);
    expect(toStr(withPrintPreferences(ab))).toBe(src);
  });

  it("解析できない入力は元のバイト列をそのまま返す", () => {
    const garbage = toArrayBuffer("not a pdf at all");
    expect(toStr(withPrintPreferences(garbage))).toBe("not a pdf at all");
  });
});
