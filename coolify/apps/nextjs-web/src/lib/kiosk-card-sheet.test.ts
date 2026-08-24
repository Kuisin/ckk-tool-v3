/**
 * kiosk-card-sheet.test.ts — QR カード印刷シートの原寸不変条件。
 *
 * 実テンプレート src/pdf-templates/kiosk-cards.html を描画して検証する
 * （プレースホルダ名の打ち間違いは `width: mm` のように無音で壊れるため）。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CARD_SHEET,
  CARD_SHEET_PAGE,
  CARDS_PER_PAGE,
  cardSheetTemplateVars,
} from "./kiosk-card-sheet";
import { renderTemplate } from "./pdf";

const rendered = (): string =>
  renderTemplate(
    readFileSync(
      path.join(process.cwd(), "src", "pdf-templates", "kiosk-cards.html"),
      "utf8",
    ),
    { pages: "", ...cardSheetTemplateVars() },
  );

describe("QR カード印刷シートの寸法", () => {
  it("カードは日本名刺サイズ 91×55mm・10 面", () => {
    expect(CARD_SHEET.cardWidth).toBe(91);
    expect(CARD_SHEET.cardHeight).toBe(55);
    expect(CARDS_PER_PAGE).toBe(10);
  });

  it("ページボックス + padding がカード格子と A4 定位置に一致する", () => {
    const { width, height, padX, padY } = CARD_SHEET_PAGE;
    // 格子はページボックスの余白ぴったりに収まる
    expect(width - padX * 2).toBe(CARD_SHEET.cardWidth * CARD_SHEET.cols);
    expect(height - padY * 2).toBe(CARD_SHEET.cardHeight * CARD_SHEET.rows);
    // 用紙中央に置かれたとき、A4 名刺用紙 10 面の定位置に戻る
    expect(CARD_SHEET.safeInset + padX).toBe(CARD_SHEET.marginX);
    expect(CARD_SHEET.safeInset + padY).toBe(CARD_SHEET.marginY);
  });

  it("ページボックスは A4 より小さい（ビューアの縮小を封じる）", () => {
    expect(CARD_SHEET_PAGE.width).toBeLessThan(210);
    expect(CARD_SHEET_PAGE.height).toBeLessThan(297);
    // 一般的な非印字マージン（3〜6mm）を包含する
    expect(CARD_SHEET.safeInset).toBeGreaterThanOrEqual(5);
  });

  it("テンプレートの @page と .sheet が Gotenberg のページサイズと一致する", () => {
    const html = rendered();
    expect(html).toContain(
      `@page { size: ${CARD_SHEET_PAGE.width}mm ${CARD_SHEET_PAGE.height}mm; margin: 0; }`,
    );
    expect(html).toContain(`width: ${CARD_SHEET_PAGE.width}mm;`);
    expect(html).toContain(`height: ${CARD_SHEET_PAGE.height}mm;`);
    expect(html).toContain(
      `padding: ${CARD_SHEET_PAGE.padY}mm ${CARD_SHEET_PAGE.padX}mm;`,
    );
  });

  it("テンプレートに未展開のプレースホルダが残らない", () => {
    expect(rendered()).not.toMatch(/\{\{|\bmm\b\s*;\s*mm/);
  });
});
