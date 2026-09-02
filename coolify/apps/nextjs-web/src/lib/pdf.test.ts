/**
 * pdf.test.ts — テンプレート差し込みのエスケープ規則（監査 H4）。
 *
 * `{{x}}` は HTML エスケープ、`{{{x}}}` だけが生。顧客名・備考のような
 * 利用者や取引先が書く文字列が帳票の HTML に紛れ込まないことをここで固定する。
 */

import { describe, expect, it } from "vitest";
import { multilineHtml, renderTemplate } from "./pdf";

describe("renderTemplate", () => {
  it("{{x}} は HTML をエスケープする（顧客名にタグを仕込めない）", () => {
    const html = renderTemplate("<td>{{name}}</td>", {
      name: `<img src=x onerror="x">&'"`,
    });
    expect(html).toBe(
      "<td>&lt;img src=x onerror=&quot;x&quot;&gt;&amp;&#39;&quot;</td>",
    );
  });

  it("{{{x}}} だけが生の HTML を通す", () => {
    const html = renderTemplate("<div>{{{svg}}}</div>", {
      svg: "<svg><rect/></svg>",
    });
    expect(html).toBe("<div><svg><rect/></svg></div>");
  });

  it("三重括弧の内側を二重括弧として二重処理しない", () => {
    const html = renderTemplate("{{{a}}}|{{a}}", { a: "<b>" });
    expect(html).toBe("<b>|&lt;b&gt;");
  });

  it("#each の中でも同じ規則", () => {
    const html = renderTemplate(
      "{{#each items}}<li>{{name}}{{{cells}}}</li>{{/each}}",
      {
        items: [
          { name: "<x>", cells: "<td>1</td>" },
          { name: "y", cells: "" },
        ],
      },
    );
    expect(html).toBe("<li>&lt;x&gt;<td>1</td></li><li>y</li>");
  });

  it("未定義・null は空文字", () => {
    expect(renderTemplate("[{{a}}][{{{b}}}]", { a: null })).toBe("[][]");
  });
});

describe("multilineHtml", () => {
  it("エスケープしてから改行だけ <br> にする", () => {
    expect(multilineHtml("a<b\nc\r\nd")).toBe("a&lt;b<br>c<br>d");
    expect(multilineHtml(null)).toBe("");
  });
});
