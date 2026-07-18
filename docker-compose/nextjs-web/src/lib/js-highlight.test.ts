import { describe, expect, it } from "vitest";
import { formatExpression, highlightExpression } from "./js-highlight";

describe("highlightExpression", () => {
  it("colours strings, numbers, keywords, and known vars; escapes HTML", () => {
    const html = highlightExpression(
      "return maxDiameter > 10 ? 'a' : x",
      new Set(["maxDiameter"]),
    );
    expect(html).toContain("maxDiameter");
    expect(html).toContain("&gt;"); // > escaped
    expect(html).toContain("'a'");
    expect(html).toMatch(/color:#[0-9a-f]{6}/i);
  });

  it("does not treat text inside strings as code", () => {
    const html = highlightExpression("'return 10'", new Set());
    // string content stays intact and is NOT coloured as a keyword (#7048e8)
    expect(html).toContain("'return 10'");
    expect(html).not.toContain("#7048e8");
  });
});

describe("formatExpression", () => {
  it("reindents by bracket depth with 2 spaces", () => {
    const out = formatExpression("a(\nb,\nc\n)");
    expect(out).toBe("a(\n  b,\n  c\n)");
  });

  it("does not count brackets inside strings", () => {
    const out = formatExpression("f('(', x)");
    expect(out).toBe("f('(', x)");
  });

  it("trims trailing whitespace and keeps blank lines", () => {
    expect(formatExpression("x   \n\ny")).toBe("x\n\ny");
  });
});
