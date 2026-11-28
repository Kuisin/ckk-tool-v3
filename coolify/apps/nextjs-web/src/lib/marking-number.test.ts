import { describe, expect, it } from "vitest";
import {
  allocationMarkingRange,
  formatMarking,
  isMarkingSplit,
  markingHead,
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

describe("分割（1 明細を複数の指示書に分けたとき）", () => {
  it("接頭辞は基数の後ろに分割番号", () => {
    expect(markingHead(200000)).toBe("A200000");
    expect(markingHead(200000, 0)).toBe("A200000");
    expect(markingHead(200000, null)).toBe("A200000");
    expect(markingHead(200000, 1)).toBe("A2000001");
    expect(markingHead(200000, 2)).toBe("A2000002");
    expect(markingHead(200000, 12)).toBe("A20000012");
  });

  it("isMarkingSplit は 1 以上だけ", () => {
    expect(isMarkingSplit(0)).toBe(false);
    expect(isMarkingSplit(null)).toBe(false);
    expect(isMarkingSplit(undefined)).toBe(false);
    expect(isMarkingSplit(-1)).toBe(false);
    expect(isMarkingSplit(1)).toBe(true);
  });

  it("枝番は分割の中で 001 から", () => {
    expect(formatMarking(200000, 5, 55, 1)).toBe("A2000001-005");
    expect(markingRange(200000, 55, 1)).toEqual({
      first: "A2000001-001",
      last: "A2000001-055",
      perLine: "A2000001",
    });
    expect(markingRange(200000, 10, 2)).toEqual({
      first: "A2000002-001",
      last: "A2000002-010",
      perLine: "A2000002",
    });
  });

  it("割当 1 件: 分割なら割当数量、分割でなければ明細の受注数量", () => {
    expect(
      allocationMarkingRange({
        base: 200000,
        split: 1,
        lineQuantity: 150,
        allocatedQuantity: 55,
      }),
    ).toEqual({
      first: "A2000001-001",
      last: "A2000001-055",
      perLine: "A2000001",
      split: 1,
    });
    expect(
      allocationMarkingRange({
        base: 200000,
        split: 0,
        lineQuantity: 150,
        allocatedQuantity: 150,
      }),
    ).toEqual({
      first: "A200000-001",
      last: "A200000-150",
      perLine: "A200000",
      split: null,
    });
  });

  it("分割でない割当があとで一部に直されても、範囲は明細ぶんのまま（凍結）", () => {
    expect(
      allocationMarkingRange({
        base: 200000,
        split: 0,
        lineQuantity: 150,
        allocatedQuantity: 40,
      }).last,
    ).toBe("A200000-150");
  });

  it("分割の割当数量が 1000 以上なら枝番の桁が広がる", () => {
    expect(
      allocationMarkingRange({
        base: 200000,
        split: 3,
        lineQuantity: 5000,
        allocatedQuantity: 1200,
      }).last,
    ).toBe("A2000003-1200");
  });
});
