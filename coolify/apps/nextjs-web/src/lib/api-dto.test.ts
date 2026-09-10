import { describe, expect, it } from "vitest";
import { dateOnly, iso, localizedJson, num } from "./api-dto";

describe("num", () => {
  it.each([
    [null, null],
    [undefined, null],
    [42, 42],
    ["1234.56", 1234.56],
    ["not-a-number", null],
  ])("%s -> %s", (input, want) => expect(num(input)).toBe(want));

  it("Prisma Decimal 風のオブジェクトも読める", () => {
    expect(num({ toString: () => "9999.99" })).toBe(9999.99);
  });
});

describe("iso / dateOnly", () => {
  const d = new Date("2026-09-10T04:05:06.000Z");
  it("iso は RFC 3339 UTC", () =>
    expect(iso(d)).toBe("2026-09-10T04:05:06.000Z"));
  it("dateOnly は日付だけ", () => expect(dateOnly(d)).toBe("2026-09-10"));
  it("null 安全", () => {
    expect(iso(null)).toBeNull();
    expect(dateOnly(null)).toBeNull();
  });
});

// ★ 画面のマッパーと違い、閲覧者の言語には解決しない。
describe("localizedJson — 生の多言語 JSON を返す", () => {
  it("そのまま通す", () => {
    expect(localizedJson({ ja: "製品", en: "Product", zh: "产品" })).toEqual({
      ja: "製品",
      en: "Product",
      zh: "产品",
    });
  });

  it("文字列は ja に寄せる（呼び出し側が形を 1 つだけ扱えるように）", () => {
    expect(localizedJson("素材")).toEqual({ ja: "素材" });
  });

  it("文字列でない値は落とす", () => {
    expect(localizedJson({ ja: "名前", bogus: 42 })).toEqual({ ja: "名前" });
  });

  it("空・null は null", () => {
    expect(localizedJson(null)).toBeNull();
    expect(localizedJson({})).toBeNull();
    expect(localizedJson({ ja: 1 })).toBeNull();
  });
});
