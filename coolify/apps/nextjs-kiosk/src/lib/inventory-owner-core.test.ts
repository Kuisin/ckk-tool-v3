import { describe, expect, it } from "vitest";
import {
  isCustomerOwnedOrderType,
  ownerBucketFor,
} from "./inventory-owner-core";

describe("ownerBucketFor — 明細の種別で所有者が決まる", () => {
  it("再研磨の明細に載る物は顧客の物", () => {
    expect(ownerBucketFor("REGRIND", "bp-1")).toBe("bp-1");
    expect(isCustomerOwnedOrderType("REGRIND")).toBe(true);
  });

  it("それ以外の種別は自社（null）。顧客が居ても所有者にはならない", () => {
    for (const t of [
      "PRODUCTION",
      "TEST",
      "SAMPLE",
      "OTHER",
      null,
      undefined,
    ]) {
      expect(ownerBucketFor(t, "bp-1")).toBeNull();
      expect(isCustomerOwnedOrderType(t)).toBe(false);
    }
  });

  it("顧客所有の種別なのに顧客が無いときは黙って自社にしない", () => {
    expect(() => ownerBucketFor("REGRIND", null)).toThrow();
    expect(() => ownerBucketFor("REGRIND", "")).toThrow();
  });
});
