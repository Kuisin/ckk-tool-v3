import { describe, expect, it } from "vitest";
import { sanitizeFileName, systematicFileName } from "./file-naming";

describe("sanitizeFileName", () => {
  it("drops path segments", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("a\\b\\c.txt")).toBe("c.txt");
  });

  it("strips forbidden characters and collapses spaces", () => {
    expect(sanitizeFileName('a<b>:"|?*.pdf')).toBe("ab.pdf");
    expect(sanitizeFileName("見積 書 v2.pdf")).toBe("見積_書_v2.pdf");
  });

  it("strips leading dots (no hidden files)", () => {
    expect(sanitizeFileName(".htaccess")).toBe("htaccess");
  });

  it("falls back for empty input", () => {
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("///")).toBe("file");
  });
});

describe("systematicFileName", () => {
  it("matches {timestamp}_{rand}_{name}", () => {
    expect(systematicFileName("scan.pdf")).toMatch(
      /^\d{8}-\d{6}_[a-z2-9]{4}_scan\.pdf$/,
    );
  });

  it("prepends the label when given", () => {
    expect(systematicFileName("納品書.pdf", "PO-202608-00001")).toMatch(
      /^\d{8}-\d{6}_[a-z2-9]{4}_PO-202608-00001_納品書\.pdf$/,
    );
  });

  it("is unique across calls", () => {
    const names = new Set(
      Array.from({ length: 50 }, () => systematicFileName("a.txt")),
    );
    // 同一秒内でも乱数 4 桁で衝突確率は無視できる（50 件で重複なしを確認）
    expect(names.size).toBe(50);
  });
});
