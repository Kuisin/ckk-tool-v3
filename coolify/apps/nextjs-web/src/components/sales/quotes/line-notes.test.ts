/**
 * line-notes.test.ts — 見積書の明細備考と値引きの注意書き。
 *
 * PDF の明細直下に刷る断片（quoteLineNoteHtml）: 受取先の言語・エスケープ・改行
 */

import { describe, expect, it } from "vitest";
import { quoteLineNoteHtml } from "@/lib/pdf-labels";

describe("quoteLineNoteHtml", () => {
  const none = { discountLabel: null, discountAmount: 0, notes: null };

  it("値引きも備考も無ければ空（行を足さない）", () => {
    expect(quoteLineNoteHtml(none, "0", "ja")).toBe("");
    expect(quoteLineNoteHtml({ ...none, notes: "  \n " }, "0", "ja")).toBe("");
  });

  it("値引きを受取先の言語で刷る", () => {
    const line = {
      ...none,
      discountLabel: "夏季キャンペーン",
      discountAmount: 500,
    };
    expect(quoteLineNoteHtml(line, "500", "ja")).toContain(
      "※ 夏季キャンペーン: -¥500",
    );
    expect(quoteLineNoteHtml(line, "500", "en")).toContain(
      "* 夏季キャンペーン: -¥500",
    );
    expect(quoteLineNoteHtml(line, "500", "zh")).toContain(
      "※ 夏季キャンペーン：-¥500",
    );
  });

  it("値引き名が無ければ「値引き」と刷る", () => {
    const line = { ...none, discountAmount: 1200 };
    expect(quoteLineNoteHtml(line, "1,200", "ja")).toContain(
      "※ 値引き: -¥1,200",
    );
    expect(quoteLineNoteHtml(line, "1,200", "en")).toContain(
      "* Discount: -¥1,200",
    );
    expect(quoteLineNoteHtml(line, "1,200", "zh")).toContain("※ 折扣：-¥1,200");
  });

  it("備考は改行を <br> にし、HTML をエスケープする", () => {
    const html = quoteLineNoteHtml(
      { ...none, notes: "1行目\n<img src=x>" },
      "0",
      "ja",
    );
    expect(html).toContain("1行目<br>&lt;img src=x&gt;");
    expect(html).not.toContain("<img");
  });

  it("値引き名もエスケープする", () => {
    const html = quoteLineNoteHtml(
      { ...none, discountLabel: "<b>x</b>", discountAmount: 1 },
      "1",
      "ja",
    );
    expect(html).not.toContain("<b>");
  });

  it("値引き → 備考の順に並べる", () => {
    const html = quoteLineNoteHtml(
      { discountLabel: "A", discountAmount: 1, notes: "メモ" },
      "1",
      "ja",
    );
    expect(html.indexOf("line-discount")).toBeLessThan(
      html.indexOf("line-notes"),
    );
  });
});
