/**
 * doc-number.test.ts — 書類番号の整形・解析（プレフィクス 2〜4 文字対応）。
 */

import { describe, expect, it } from "vitest";
import { formatDocNumber, parseDocKey } from "./doc-number";

describe("formatDocNumber", () => {
  it("WOR（指示書の書類番号）を 5 桁で整形する", () => {
    expect(formatDocNumber("WOR", { yearMonth: "202608", seq: 13 })).toBe(
      "WOR-202608-00013",
    );
  });
});

describe("parseDocKey", () => {
  it("WOR プレフィクスを受ける", () => {
    expect(parseDocKey("WOR-202608-00013", "WOR")).toEqual({
      yearMonth: "202608",
      seq: 13,
    });
  });

  it("3 文字プレフィクス（従来）も引き続き受ける", () => {
    expect(parseDocKey("ORD-202607-00001", "ORD")).toEqual({
      yearMonth: "202607",
      seq: 1,
    });
  });

  it("プレフィクス不一致・生 int は null", () => {
    expect(parseDocKey("ORD-202607-00001", "WOR")).toBeNull();
    expect(parseDocKey("9013", "WOR")).toBeNull();
  });
});
