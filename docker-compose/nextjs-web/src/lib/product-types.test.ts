import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_TYPES,
  type ProductTypeItem,
  productTypesArraySchema,
  validateItemValue,
} from "./product-types";

const item = (over: Partial<ProductTypeItem>): ProductTypeItem => ({
  key: "k",
  label: { ja: "項目", en: "Item" },
  type: "string",
  required: false,
  order: 0,
  ...over,
});

describe("validateItemValue", () => {
  it("enforces required only when empty", () => {
    expect(validateItemValue(item({ required: true }), "")).toMatch(/必須/);
    expect(validateItemValue(item({ required: true }), "x")).toBeNull();
    expect(validateItemValue(item({ required: false }), "")).toBeNull();
  });

  it("validates numbers with min/max", () => {
    const n = item({ type: "number", min: 0, max: 100 });
    expect(validateItemValue(n, "abc")).toMatch(/数値/);
    expect(validateItemValue(n, "-1")).toMatch(/以上/);
    expect(validateItemValue(n, "101")).toMatch(/以下/);
    expect(validateItemValue(n, "60")).toBeNull();
  });

  it("validates select against options", () => {
    const s = item({
      type: "select",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(validateItemValue(s, "c")).toMatch(/選択/);
    expect(validateItemValue(s, "a")).toBeNull();
  });

  it("validates dates and booleans", () => {
    expect(validateItemValue(item({ type: "date" }), "not-a-date")).toMatch(
      /日付/,
    );
    expect(validateItemValue(item({ type: "date" }), "2026-07-19")).toBeNull();
    expect(validateItemValue(item({ type: "boolean" }), "true")).toBeNull();
    expect(validateItemValue(item({ type: "boolean" }), "maybe")).toMatch(
      /真偽/,
    );
  });

  it("default product types pass their own schema", () => {
    expect(
      productTypesArraySchema.safeParse(DEFAULT_PRODUCT_TYPES).success,
    ).toBe(true);
  });
});
