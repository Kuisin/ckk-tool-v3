import { describe, expect, it } from "vitest";
import { collectMarkdownLinks } from "./markdown-links";

describe("collectMarkdownLinks", () => {
  it("Markdown 記法のリンクを拾う", () => {
    expect(collectMarkdownLinks("[例](https://example.com/a)")).toEqual([
      "https://example.com/a",
    ]);
  });

  it("山括弧の自動リンクを拾う", () => {
    expect(collectMarkdownLinks("<https://example.com/b>")).toEqual([
      "https://example.com/b",
    ]);
  });

  it("素の URL を拾う", () => {
    expect(collectMarkdownLinks("参考: https://example.com/c です")).toEqual([
      "https://example.com/c",
    ]);
  });

  it("末尾の句読点は含めない", () => {
    expect(collectMarkdownLinks("https://example.com/d。")).toEqual([
      "https://example.com/d",
    ]);
  });

  it("同じ URL は 1 度だけ返す", () => {
    const body = "[a](https://x.test/1)\n[b](https://x.test/1)";
    expect(collectMarkdownLinks(body)).toEqual(["https://x.test/1"]);
  });

  it("社内パスは拾わない（短縮の対象外）", () => {
    expect(collectMarkdownLinks("[社内](/general/documents/DOC-1)")).toEqual(
      [],
    );
  });

  it("空文字は空配列", () => {
    expect(collectMarkdownLinks("")).toEqual([]);
  });

  it("複数回呼んでも結果が変わらない（lastIndex の持ち越しが無い）", () => {
    const body = "https://a.test/1 と https://b.test/2";
    const first = collectMarkdownLinks(body);
    const second = collectMarkdownLinks(body);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
  });
});
