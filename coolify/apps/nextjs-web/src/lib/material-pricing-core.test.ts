import { describe, expect, it } from "vitest";
import {
  computeReferencePrice,
  latestMaterialPrice,
  type MaterialPricePoint,
} from "./material-pricing-core";

const p = (date: string, unitPrice: number): MaterialPricePoint => ({
  date,
  unitPrice,
  supplier: "S",
  poNumber: `PO-${date}`,
});

const HISTORY = [
  p("2025-07-10", 4930),
  p("2025-12-05", 5210),
  p("2026-03-18", 5420),
  p("2026-05-27", 5300),
];

describe("computeReferencePrice", () => {
  it("empty history → hasHistory=false, price 0", () => {
    const r = computeReferencePrice([], "MAX", 6);
    expect(r.hasHistory).toBe(false);
    expect(r.unitPrice).toBe(0);
    expect(r.usedDefault).toBe(false);
  });

  it("empty history + default price → uses default, usedDefault=true", () => {
    const r = computeReferencePrice([], "MAX", 6, undefined, 4200);
    expect(r.hasHistory).toBe(false);
    expect(r.unitPrice).toBe(4200);
    expect(r.usedDefault).toBe(true);
  });

  it("with history the default is ignored (usedDefault=false)", () => {
    const r = computeReferencePrice(HISTORY, "MAX", 6, undefined, 4200);
    expect(r.usedDefault).toBe(false);
    expect(r.unitPrice).toBe(5420);
  });

  it("MAX picks the highest in the lookback window", () => {
    // anchor = 2026-05-27; 6mo window ⊇ 2025-12-05..2026-05-27
    const r = computeReferencePrice(HISTORY, "MAX", 6);
    expect(r.unitPrice).toBe(5420);
    expect(r.date).toBe("2026-03-18");
    expect(r.windowPoints).toHaveLength(3);
  });

  it("LATEST picks the newest in the window", () => {
    const r = computeReferencePrice(HISTORY, "LATEST", 6);
    expect(r.unitPrice).toBe(5300);
    expect(r.date).toBe("2026-05-27");
  });

  it("AVERAGE rounds the window mean", () => {
    const r = computeReferencePrice(HISTORY, "AVERAGE", 6);
    expect(r.unitPrice).toBe(Math.round((5210 + 5420 + 5300) / 3));
  });

  it("narrow window still includes the anchor point", () => {
    const r = computeReferencePrice(HISTORY, "MAX", 1);
    expect(r.windowPoints).toHaveLength(1);
    expect(r.unitPrice).toBe(5300);
  });

  it("anchor far past the data falls back to all history", () => {
    const r = computeReferencePrice(HISTORY, "MAX", 1, new Date("2027-06-01"));
    expect(r.windowPoints).toHaveLength(HISTORY.length);
    expect(r.unitPrice).toBe(5420);
  });
});

describe("latestMaterialPrice", () => {
  it("returns the last point / empty fallback", () => {
    expect(latestMaterialPrice(HISTORY).unitPrice).toBe(5300);
    expect(latestMaterialPrice([]).hasHistory).toBe(false);
  });
});
