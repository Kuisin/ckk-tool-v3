import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings, lists, and inline code", () => {
    const html = renderMarkdown("# Title\n\n- a\n- b\n\nuse `code` here");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<code>code</code>");
  });

  it("renders bold, links, and code fences", () => {
    const html = renderMarkdown(
      "**bold** and [x](https://e.com)\n\n```\nline\n```",
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://e.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("<pre><code>line</code></pre>");
  });

  it("escapes HTML in the source", () => {
    const html = renderMarkdown("a <script>alert(1)</script> b");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not corrupt digits surrounded by spaces", () => {
    const html = renderMarkdown("value is 3 mm and `x` too");
    expect(html).toContain("value is 3 mm");
    expect(html).toContain("<code>x</code>");
  });
});
