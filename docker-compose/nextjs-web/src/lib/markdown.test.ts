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

  it("keeps the current language on internal /docs links", () => {
    const html = renderMarkdown("see [start](/docs/start)", "en");
    expect(html).toContain('href="/docs/start?lang=en"');
    // external links get no lang and stay target=_blank
    const ext = renderMarkdown("see [site](https://e.com)", "en");
    expect(ext).toContain('href="https://e.com"');
    expect(ext).not.toContain("lang=en");
  });

  it("does not append lang when none is given, or to non-docs paths", () => {
    expect(renderMarkdown("[a](/docs/start)")).toContain('href="/docs/start"');
    expect(renderMarkdown("[a](/sales/x)", "ja")).toContain('href="/sales/x"');
  });
});
