import { describe, expect, it } from "vitest";
import { taxRateFor } from "./tax-rate";

describe("taxRateFor", () => {
  it("課税 / 軽減 / 非課税", () => {
    expect(taxRateFor("TAXABLE")).toBe(0.1);
    expect(taxRateFor("REDUCED")).toBe(0.08);
    expect(taxRateFor("EXEMPT")).toBe(0);
  });
  it("未指定・不明は課税扱い", () => {
    expect(taxRateFor(null)).toBe(0.1);
    expect(taxRateFor(undefined)).toBe(0.1);
    expect(taxRateFor("WHATEVER")).toBe(0.1);
  });
});
