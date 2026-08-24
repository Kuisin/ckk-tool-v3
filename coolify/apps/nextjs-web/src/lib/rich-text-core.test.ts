import { describe, expect, it } from "vitest";
import {
  collectLinkHrefs,
  describeStructure,
  emptyDoc,
  isEmptyDoc,
  isIndexableUrl,
  isInternalPath,
  isSafeHref,
  MAX_NODE_DEPTH,
  MAX_PLAIN_TEXT_LENGTH,
  parseRichText,
  type RichTextDoc,
  type RichTextNode,
  rewriteLinkHrefs,
  toHtml,
  toPlainText,
} from "./rich-text-core";

/** doc ラッパ（テストの見通しのため）。 */
const doc = (...content: RichTextNode[]): RichTextDoc => ({
  type: "doc",
  content,
});
const para = (...content: RichTextNode[]): RichTextNode => ({
  type: "paragraph",
  content,
});
const text = (value: string, marks?: RichTextNode["marks"]): RichTextNode => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

describe("parseRichText", () => {
  // 不変条件: 許可リストに無いノードは一切通さない（保存 XSS の入口を塞ぐ）。
  it("rejects nodes outside the allowlist", () => {
    for (const type of ["image", "iframe", "script", "html", "embed"]) {
      const result = parseRichText(doc({ type } as RichTextNode));
      expect(result.ok, `${type} should be rejected`).toBe(false);
    }
  });

  it("rejects marks outside the allowlist", () => {
    const result = parseRichText(
      doc(para(text("x", [{ type: "textStyle", attrs: { color: "red" } }]))),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts the toolbar's full node + mark set", () => {
    const result = parseRichText(
      doc(
        { type: "heading", attrs: { level: 3 }, content: [text("見出し")] },
        { type: "heading", attrs: { level: 4 }, content: [text("小見出し")] },
        para(
          text("太字", [{ type: "bold" }]),
          text("斜体", [{ type: "italic" }]),
          text("下線", [{ type: "underline" }]),
          text("打消", [{ type: "strike" }]),
          text("コード", [{ type: "code" }]),
        ),
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [para(text("項目"))] }],
        },
        {
          type: "orderedList",
          content: [{ type: "listItem", content: [para(text("項目"))] }],
        },
        { type: "blockquote", content: [para(text("引用"))] },
        { type: "codeBlock", content: [text("const a = 1;")] },
        { type: "horizontalRule" },
      ),
    );
    expect(result.ok).toBe(true);
  });

  // 不変条件: H1/H2 はページ見出しと衝突するので許可しない。
  it("rejects heading levels other than 3 and 4", () => {
    for (const level of [1, 2, 5, 6]) {
      const result = parseRichText(
        doc({ type: "heading", attrs: { level }, content: [text("x")] }),
      );
      expect(result.ok, `h${level} should be rejected`).toBe(false);
    }
  });

  it("rejects docs nested deeper than MAX_NODE_DEPTH", () => {
    // bulletList > listItem をひたすら入れ子にして上限を越える。
    let node: RichTextNode = para(text("深い"));
    for (let i = 0; i < MAX_NODE_DEPTH + 2; i++) {
      node = {
        type: "bulletList",
        content: [{ type: "listItem", content: [node] }],
      };
    }
    expect(parseRichText(doc(node)).ok).toBe(false);
  });

  // 回帰テスト: スキーマを discriminatedUnion から通常の z.union に戻すと、
  // 候補ごとに部分木を再帰するため深さに対して指数時間になり、ここで固まる。
  // 深い入れ子を現実的な時間で捌けることを保証する。
  it("parses deeply nested content in linear time", () => {
    let node: RichTextNode = para(text("深い"));
    for (let i = 0; i < 60; i++) {
      node = {
        type: "bulletList",
        content: [{ type: "listItem", content: [node] }],
      };
    }
    const started = performance.now();
    parseRichText(doc(node));
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("rejects docs whose plain text exceeds the length cap", () => {
    const long = "あ".repeat(MAX_PLAIN_TEXT_LENGTH + 1);
    expect(parseRichText(doc(para(text(long)))).ok).toBe(false);
  });

  it("returns the plain-text projection alongside the doc", () => {
    const result = parseRichText(doc(para(text("こんにちは"))));
    expect(result.ok && result.plainText).toBe("こんにちは");
  });

  // 不変条件: 却下の理由に「どこが」を必ず含める。理由なしの
  // 「形式が不正です」だけだと、利用者の報告からもログからも原因を追えない
  // （実際に文書リンク付きメモの保存失敗で原因特定に難儀した）。
  it("names the offending path when rejecting", () => {
    const unknownNode = parseRichText(doc({ type: "image" } as RichTextNode));
    expect(unknownNode.ok).toBe(false);
    if (!unknownNode.ok) {
      expect(unknownNode.error).toContain("content.0.type");
    }

    const badHref = parseRichText(
      doc(
        para(text("x", [{ type: "link", attrs: { href: "//evil.example" } }])),
      ),
    );
    expect(badHref.ok).toBe(false);
    if (!badHref.ok) {
      expect(badHref.error).toContain("marks.0.attrs.href");
      expect(badHref.error).toContain("リンク先の形式が不正です");
    }
  });

  // 不変条件: tiptap（StarterKit v3）が実際に吐く JSON をそのまま受け入れ、
  // 余剰属性（link の target/rel/class・codeBlock の language 等）は捨てる。
  // ここが落ちるとエディタで入力できるのに保存だけ失敗する。
  it("accepts a realistic tiptap payload and strips extra attrs", () => {
    const result = parseRichText({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "詳細",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com/spec",
                    target: "_blank",
                    rel: "noopener noreferrer nofollow",
                    class: null,
                  },
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 1, type: null },
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("手順")] }],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [text("const a = 1;")],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const link = result.doc.content?.[0]?.content?.[0]?.marks?.[0];
    expect(link?.attrs).toEqual({ href: "https://example.com/spec" });
    // 未知の attrs はスキーマに無いので保存対象から消える。
    expect(result.doc.content?.[1]?.attrs).toBeUndefined();
    expect(result.plainText).toBe("詳細\n手順\nconst a = 1;");
  });

  // 回帰: union の下位 issue に外側のパスを継ぎ足さないと配列添字が落ち、
  // 「どのマークが原因か」が分からなくなる（実際にこれで原因特定に難儀した）。
  it("keeps the array index when a mark inside a union fails", () => {
    const result = parseRichText(
      doc(
        para(
          text("ok", [{ type: "bold" }]),
          text("ng", [{ type: "link", attrs: { href: "javascript:1" } }]),
        ),
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // 2 番目のテキストの 0 番目のマークだと分かること。
    expect(result.error).toContain("content.0.content.1.marks.0");
  });

  // 不変条件: null / 非オブジェクト / 壊れた JSON でも例外を投げず ok:false を返す。
  it("handles null and malformed input", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "text",
      [],
      {},
      { type: "paragraph" },
    ]) {
      expect(parseRichText(bad).ok, `${JSON.stringify(bad)}`).toBe(false);
    }
  });
});

describe("describeStructure", () => {
  // 不変条件: 本文（text）は出さず、構造と型だけを出す。
  // ログに業務データを流さずに原因を特定するための道具。
  it("summarises node and mark types without leaking text", () => {
    const summary = describeStructure(
      doc(
        para(
          text("社外秘の本文", [
            { type: "link", attrs: { href: "https://example.com" } },
          ]),
        ),
      ),
    );
    expect(summary).not.toContain("社外秘の本文");
    expect(summary).toContain("doc");
    expect(summary).toContain("paragraph");
    expect(summary).toContain("link");
    expect(summary).toContain("attrs=object");
  });

  // これが今回の調査の決め手になる出力。
  it("reveals a function where attrs should be an object", () => {
    const summary = describeStructure({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "link", attrs: () => null }] },
          ],
        },
      ],
    });
    expect(summary).toContain("attrs=function");
  });

  it("handles null, primitives and deep nesting", () => {
    expect(describeStructure(null)).toBe("null");
    expect(describeStructure(42)).toBe("number");
    expect(describeStructure("x")).toBe("string");
  });
});

describe("isSafeHref", () => {
  // 不変条件: スクリプト実行につながるスキームは通さない。
  it("rejects dangerous schemes", () => {
    const bad = [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      // アプリ内パスは許可されるが、別オリジンへ抜ける書き方は不可。
      "//evil.example",
      "/\\evil.example",
      "not a url",
      "",
    ];
    for (const href of bad) {
      expect(isSafeHref(href), href).toBe(false);
    }
  });

  it("accepts http, https, mailto and in-app paths", () => {
    for (const href of [
      "https://example.com/a?b=1",
      "http://192.168.50.15:3000/",
      "mailto:someone@example.com",
      "/sales/quotes/QOT-202608-00001",
      "/l/ABCD2345",
    ]) {
      expect(isSafeHref(href), href).toBe(true);
    }
  });

  it("rejects a link mark carrying a dangerous href at parse time", () => {
    const result = parseRichText(
      doc(
        para(
          text("クリック", [
            { type: "link", attrs: { href: "javascript:alert(1)" } },
          ]),
        ),
      ),
    );
    expect(result.ok).toBe(false);
  });
});

describe("isInternalPath", () => {
  // 不変条件: ブラウザが外部 URL として解釈しうる書き方は内部パス扱いしない。
  // ここを緩めるとオープンリダイレクトの入口になる。
  it("rejects paths that can escape to another origin", () => {
    for (const href of [
      "//evil.example",
      "//evil.example/path",
      "/\\evil.example",
      "/\\/evil.example",
      "https://evil.example",
      "evil.example",
      "",
    ]) {
      expect(isInternalPath(href), href).toBe(false);
    }
  });

  it("rejects control characters smuggled into a path", () => {
    expect(isInternalPath("/sales/quotes\n/../evil")).toBe(false);
    expect(isInternalPath("/sales\tquotes")).toBe(false);
  });

  it("accepts ordinary in-app paths", () => {
    for (const href of [
      "/sales/quotes/QOT-202608-00001",
      "/production/work-orders/1234",
      "/l/ABCD2345",
      "/settings/users?tab=roles",
    ]) {
      expect(isInternalPath(href), href).toBe(true);
    }
  });

  it("accepts in-app paths through the parse allowlist", () => {
    const result = parseRichText(
      doc(
        para(
          text("見積書", [
            { type: "link", attrs: { href: "/sales/quotes/QOT-202608-00001" } },
          ]),
        ),
      ),
    );
    expect(result.ok).toBe(true);
  });

  it("still rejects protocol-relative hrefs at parse time", () => {
    const result = parseRichText(
      doc(
        para(text("x", [{ type: "link", attrs: { href: "//evil.example" } }])),
      ),
    );
    expect(result.ok).toBe(false);
  });
});

describe("isIndexableUrl", () => {
  // 不変条件: 短縮の対象は http(s) だけ。mailto とアプリ内パスは素通し。
  it("indexes only http and https", () => {
    expect(isIndexableUrl("https://example.com")).toBe(true);
    expect(isIndexableUrl("http://example.com")).toBe(true);
    expect(isIndexableUrl("mailto:a@example.com")).toBe(false);
    expect(isIndexableUrl("/sales/quotes/QOT-1")).toBe(false);
    expect(isIndexableUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("collectLinkHrefs", () => {
  it("collects every link href once, at any depth", () => {
    const found = collectLinkHrefs(
      doc(
        para(
          text("a", [{ type: "link", attrs: { href: "https://a.example" } }]),
          text("dup", [{ type: "link", attrs: { href: "https://a.example" } }]),
        ),
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                para(
                  text("b", [
                    { type: "link", attrs: { href: "https://b.example" } },
                  ]),
                ),
              ],
            },
          ],
        },
      ),
    );
    expect(found.sort()).toEqual(["https://a.example", "https://b.example"]);
  });

  it("handles null and link-free docs", () => {
    expect(collectLinkHrefs(null)).toEqual([]);
    expect(collectLinkHrefs(doc(para(text("プレーン"))))).toEqual([]);
  });
});

describe("rewriteLinkHrefs", () => {
  // 不変条件: 元の doc を破壊しない（保存前の値を監査ログに残せる必要がある）。
  it("returns a new doc and leaves the original untouched", () => {
    const original = doc(
      para(text("a", [{ type: "link", attrs: { href: "https://a.example" } }])),
    );
    const next = rewriteLinkHrefs(original, { "https://a.example": "/l/AB12" });
    expect(next.content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.href).toBe(
      "/l/AB12",
    );
    expect(original.content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.href).toBe(
      "https://a.example",
    );
  });

  it("rewrites nested links and leaves unmapped ones alone", () => {
    const next = rewriteLinkHrefs(
      doc({
        type: "blockquote",
        content: [
          para(
            text("a", [{ type: "link", attrs: { href: "https://a.example" } }]),
            text("b", [{ type: "link", attrs: { href: "https://b.example" } }]),
          ),
        ],
      }),
      { "https://a.example": "/l/AB12" },
    );
    const marks = next.content?.[0]?.content?.[0]?.content;
    expect(marks?.[0]?.marks?.[0]?.attrs?.href).toBe("/l/AB12");
    expect(marks?.[1]?.marks?.[0]?.attrs?.href).toBe("https://b.example");
  });

  it("leaves non-link marks untouched", () => {
    const next = rewriteLinkHrefs(doc(para(text("x", [{ type: "bold" }]))), {
      "https://a.example": "/l/AB12",
    });
    expect(next.content?.[0]?.content?.[0]?.marks?.[0]).toEqual({
      type: "bold",
    });
  });
});

describe("toPlainText", () => {
  // 不変条件: ブロック境界は改行になり、連続改行は 1 つに畳まれる。
  it("joins blocks with single newlines", () => {
    const value = toPlainText(
      doc(para(text("一行目")), para(), para(text("二行目"))),
    );
    expect(value).toBe("一行目\n二行目");
  });

  it("turns hardBreak into a newline", () => {
    expect(
      toPlainText(doc(para(text("上"), { type: "hardBreak" }, text("下")))),
    ).toBe("上\n下");
  });

  it("flattens nested lists", () => {
    expect(
      toPlainText(
        doc({
          type: "bulletList",
          content: [
            { type: "listItem", content: [para(text("A"))] },
            { type: "listItem", content: [para(text("B"))] },
          ],
        }),
      ),
    ).toBe("A\nB");
  });

  it("handles null and empty input", () => {
    expect(toPlainText(null)).toBe("");
    expect(toPlainText(undefined)).toBe("");
    expect(toPlainText(doc())).toBe("");
  });
});

describe("isEmptyDoc", () => {
  it("treats an empty paragraph and whitespace as empty", () => {
    expect(isEmptyDoc(emptyDoc())).toBe(true);
    expect(isEmptyDoc(doc(para()))).toBe(true);
    expect(isEmptyDoc(doc(para(text("   "))))).toBe(true);
    expect(isEmptyDoc(null)).toBe(true);
    expect(isEmptyDoc(undefined)).toBe(true);
  });

  it("treats any real text as non-empty", () => {
    expect(isEmptyDoc(doc(para(text("a"))))).toBe(false);
  });
});

describe("toHtml", () => {
  // 不変条件: 本文テキストは必ずエスケープされる（PDF 経路は無エスケープなので、
  // ここが最後の砦になる）。
  it("escapes text content", () => {
    const html = toHtml(doc(para(text('<script>alert("x")</script>'))));
    expect(html).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    );
    expect(html).not.toContain("<script>");
  });

  it("escapes ampersands exactly once", () => {
    expect(toHtml(doc(para(text("A & B"))))).toBe("<p>A &amp; B</p>");
  });

  it("wraps marks in their tags", () => {
    expect(toHtml(doc(para(text("x", [{ type: "bold" }]))))).toBe(
      "<p><strong>x</strong></p>",
    );
    expect(
      toHtml(doc(para(text("x", [{ type: "italic" }, { type: "bold" }])))),
    ).toBe("<p><strong><em>x</em></strong></p>");
  });

  it("renders links with an escaped href and a safe rel", () => {
    const html = toHtml(
      doc(
        para(
          text("リンク", [
            { type: "link", attrs: { href: 'https://example.com/?a=1&b="2"' } },
          ]),
        ),
      ),
    );
    expect(html).toBe(
      '<p><a href="https://example.com/?a=1&amp;b=&quot;2&quot;" rel="noopener noreferrer" target="_blank">リンク</a></p>',
    );
  });

  // 内部リンク（文書リンク・短縮リンク）はアプリ内遷移なので target を付けない。
  it("renders in-app links without target=_blank", () => {
    expect(
      toHtml(
        doc(
          para(
            text("見積書", [
              {
                type: "link",
                attrs: { href: "/sales/quotes/QOT-202608-00001" },
              },
            ]),
          ),
        ),
      ),
    ).toBe('<p><a href="/sales/quotes/QOT-202608-00001">見積書</a></p>');
  });

  // 不変条件: 検証を迂回して危険な href が届いても、リンクにはしない。
  it("drops a dangerous href even if it bypassed validation", () => {
    const html = toHtml(
      doc(
        para(
          text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
        ),
      ),
    );
    expect(html).toBe("<p>x</p>");
    expect(html).not.toContain("javascript:");
  });

  it("renders block structure", () => {
    expect(
      toHtml(
        doc(
          { type: "heading", attrs: { level: 3 }, content: [text("見出し")] },
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [para(text("項目"))] }],
          },
          { type: "horizontalRule" },
        ),
      ),
    ).toBe("<h3>見出し</h3><ul><li><p>項目</p></li></ul><hr>");
  });

  it("handles null and empty input", () => {
    expect(toHtml(null)).toBe("");
    expect(toHtml(undefined)).toBe("");
    expect(toHtml(doc())).toBe("");
  });
});
