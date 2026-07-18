import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_ITEM_DEFS,
  DEFAULT_PRODUCT_TYPES,
  type ProductItemDef,
  productItemDefsArraySchema,
  productTypesArraySchema,
  resolveProductType,
  validateItemValue,
} from "./product-types";

const item = (over: Partial<ProductItemDef>): ProductItemDef => ({
  key: "k",
  label: { ja: "項目", en: "Item" },
  type: "string",
  required: false,
  order: 0,
  enabled: true,
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
});

describe("resolveProductType", () => {
  it("joins assignments to definitions in order, applying default override", () => {
    const defs: ProductItemDef[] = [
      item({ key: "a", default: "base", order: 0 }),
      item({ key: "b", order: 1 }),
    ];
    const resolved = resolveProductType(
      {
        id: "t",
        name: { ja: "T", en: "" },
        enabled: true,
        order: 0,
        assignments: [
          { itemKey: "b", order: 0 },
          { itemKey: "a", defaultValue: "override", order: 1 },
        ],
      },
      defs,
    );
    expect(resolved.items.map((i) => i.key)).toEqual(["b", "a"]);
    expect(resolved.items[1].default).toBe("override"); // assignment wins
    expect(resolved.items[0].default).toBe(""); // no default anywhere
  });

  it("skips assignments whose definition was deleted", () => {
    const resolved = resolveProductType(
      {
        id: "t",
        name: { ja: "T", en: "" },
        enabled: true,
        order: 0,
        assignments: [{ itemKey: "missing", order: 0 }],
      },
      [],
    );
    expect(resolved.items).toHaveLength(0);
  });
});

describe("defaults", () => {
  it("default defs and types pass their schemas", () => {
    expect(
      productItemDefsArraySchema.safeParse(DEFAULT_PRODUCT_ITEM_DEFS).success,
    ).toBe(true);
    expect(
      productTypesArraySchema.safeParse(DEFAULT_PRODUCT_TYPES).success,
    ).toBe(true);
  });

  it("every default assignment references a real definition", () => {
    const keys = new Set(DEFAULT_PRODUCT_ITEM_DEFS.map((d) => d.key));
    for (const t of DEFAULT_PRODUCT_TYPES) {
      for (const a of t.assignments) expect(keys.has(a.itemKey)).toBe(true);
    }
  });
});
