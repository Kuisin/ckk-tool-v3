import { describe, expect, it } from "vitest";
import {
  composeMaterialCode,
  composeMaterialTypeCode,
  diameterCodeFromMm,
  formatKindSerial,
  isStructuredMaterialTypeId,
  lengthCodeFromMm,
} from "./material-code";

describe("material-code", () => {
  it("composes 材種コード", () => {
    expect(composeMaterialTypeCode("B", "01", "B", "0001")).toBe("B01B0001");
    expect(() => composeMaterialTypeCode("B", "1", "B", "0001")).toThrow();
  });

  it("kind serial pads to 4 digits and bounds", () => {
    expect(formatKindSerial(1)).toBe("0001");
    expect(formatKindSerial(9999)).toBe("9999");
    expect(() => formatKindSerial(0)).toThrow();
    expect(() => formatKindSerial(10000)).toThrow();
  });

  it("diameter code = TEXT(mm*10,'000')", () => {
    expect(diameterCodeFromMm(8.3)).toBe("083");
    expect(diameterCodeFromMm(0.1)).toBe("001");
    expect(diameterCodeFromMm(99.9)).toBe("999");
    expect(diameterCodeFromMm(12)).toBe("120");
    expect(() => diameterCodeFromMm(0)).toThrow();
    expect(() => diameterCodeFromMm(100)).toThrow();
  });

  it("length code = TEXT(mm,'000')", () => {
    expect(lengthCodeFromMm(330)).toBe("330");
    expect(lengthCodeFromMm(1)).toBe("001");
    expect(lengthCodeFromMm(999)).toBe("999");
    expect(() => lengthCodeFromMm(0)).toThrow();
    expect(() => lengthCodeFromMm(1000)).toThrow();
  });

  it("composes 素材コード", () => {
    expect(composeMaterialCode("B01B0001", "A", "083", "330")).toBe(
      "B01B0001-A083-330",
    );
    expect(() =>
      composeMaterialCode("not-a-code", "A", "083", "330"),
    ).toThrow();
  });

  it("distinguishes structured vs legacy ids", () => {
    expect(isStructuredMaterialTypeId("B01B0001")).toBe(true);
    expect(
      isStructuredMaterialTypeId("632415f1-b320-5380-8cd6-276704a268fb"),
    ).toBe(false);
    expect(isStructuredMaterialTypeId("TSC-HEM4L2.5")).toBe(false);
  });
});
