import { describe, expect, it } from "vitest";
import { appendTierRange, setTierEnd } from "./model";

const t = (minQuantity: number, maxQuantity: number | null) => ({
  minQuantity,
  maxQuantity,
});

describe("setTierEnd — 前の行の終わりが次の行の始まりになる", () => {
  it("fills the next row's start with end + 1", () => {
    const r = setTierEnd([t(1, 5), t(6, 20), t(21, null)], 0, 9);
    expect(r).toEqual([t(1, 9), t(10, 20), t(21, null)]);
  });

  it("leaves the next row alone when the end is cleared or there is no next row", () => {
    expect(setTierEnd([t(1, 5), t(6, null)], 0, null)).toEqual([
      t(1, null),
      t(6, null),
    ]);
    expect(setTierEnd([t(1, 5)], 0, 9)).toEqual([t(1, 9)]);
  });
});

describe("appendTierRange", () => {
  it("starts the new row at the last end + 1", () => {
    expect(appendTierRange([t(1, 50)], (m) => t(m, null))).toEqual([
      t(1, 50),
      t(51, null),
    ]);
  });

  it("closes an open-ended last row before continuing", () => {
    expect(appendTierRange([t(1, 5), t(6, null)], (m) => t(m, null))).toEqual([
      t(1, 5),
      t(6, 105),
      t(106, null),
    ]);
  });

  it("starts at 1 when empty", () => {
    expect(appendTierRange([], (m) => t(m, null))).toEqual([t(1, null)]);
  });
});
