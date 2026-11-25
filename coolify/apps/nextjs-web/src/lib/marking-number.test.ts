import { describe, expect, it } from "vitest";
import {
  formatMarking,
  markingPieceDigits,
  markingRange,
} from "./marking-number";

describe("formatMarking", () => {
  it("枝番なしは明細ごとの番号", () => {
    expect(formatMarking(200000)).toBe("A200000");
    expect(formatMarking(200000, null)).toBe("A200000");
  });

  it("枝番は最低 3 桁", () => {
    expect(formatMarking(200000, 1)).toBe("A200000-001");
    expect(formatMarking(200123, 50)).toBe("A200123-050");
    expect(formatMarking(200000, 999)).toBe("A200000-999");
  });

  it("数量が 999 を超えると数量の桁数まで広げる", () => {
    expect(formatMarking(200000, 7, 1200)).toBe("A200000-0007");
    expect(formatMarking(200000, 1200, 1200)).toBe("A200000-1200");
    expect(formatMarking(200000, 1000)).toBe("A200000-1000");
  });
});

describe("markingPieceDigits", () => {
  it("最低 3、それ以上は数量の桁数", () => {
    expect(markingPieceDigits(undefined)).toBe(3);
    expect(markingPieceDigits(5)).toBe(3);
    expect(markingPieceDigits(999)).toBe(3);
    expect(markingPieceDigits(1000)).toBe(4);
    expect(markingPieceDigits(12345)).toBe(5);
  });
});

describe("markingRange", () => {
  it("最初と最後と明細ごとの番号", () => {
    expect(markingRange(200000, 50)).toEqual({
      first: "A200000-001",
      last: "A200000-050",
      perLine: "A200000",
    });
  });

  it("1 本だけなら最初と最後が同じ", () => {
    const r = markingRange(200001, 1);
    expect(r.first).toBe("A200001-001");
    expect(r.last).toBe("A200001-001");
  });

  it("数量 1000 以上は両端とも同じ桁に揃う", () => {
    expect(markingRange(200002, 1500)).toEqual({
      first: "A200002-0001",
      last: "A200002-1500",
      perLine: "A200002",
    });
  });

  it("数量が壊れていても落ちない", () => {
    expect(markingRange(200003, 0).last).toBe("A200003-001");
  });
});
