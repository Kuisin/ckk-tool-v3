import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ja from "../../messages/ja.json";
import type { Tr } from "./i18n";
import {
  DEFAULT_PRODUCT_ITEM_DEFS,
  DEFAULT_PRODUCT_TYPES,
  type ProductItemDef,
  productItemDefsArraySchema,
  productTypesArraySchema,
  resolveProductType,
  validateItemValue,
} from "./product-types";

// biome-ignore lint/suspicious/noExplicitAny: next-intl's messages type is too wide for a plain JSON import here; real key checks run in verify-keys.mjs (see global.d.ts)
const tr = createTranslator({ locale: "ja", messages: ja as any }) as Tr;

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
    expect(validateItemValue(item({ required: true }), "", tr)).toMatch(/必須/);
    expect(validateItemValue(item({ required: true }), "x", tr)).toBeNull();
    expect(validateItemValue(item({ required: false }), "", tr)).toBeNull();
  });

  it("validates numbers with min/max", () => {
    const n = item({ type: "number", min: 0, max: 100 });
    expect(validateItemValue(n, "abc", tr)).toMatch(/数値/);
    expect(validateItemValue(n, "-1", tr)).toMatch(/以上/);
    expect(validateItemValue(n, "101", tr)).toMatch(/以下/);
    expect(validateItemValue(n, "60", tr)).toBeNull();
  });

  it("validates select against options", () => {
    const s = item({
      type: "select",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(validateItemValue(s, "c", tr)).toMatch(/選択/);
    expect(validateItemValue(s, "a", tr)).toBeNull();
  });

  it("validates strings against a regex pattern", () => {
    const p = item({ type: "string", pattern: "^[A-Z]{2}-\\d{4}$" });
    expect(validateItemValue(p, "AB-1234", tr)).toBeNull();
    expect(validateItemValue(p, "ab-1234", tr)).toMatch(/形式/);
    // empty is allowed when not required (pattern not applied)
    expect(validateItemValue(p, "", tr)).toBeNull();
    // invalid regex is ignored (never throws)
    expect(
      validateItemValue(item({ type: "string", pattern: "(" }), "x", tr),
    ).toBeNull();
  });

  it("validates dates and booleans", () => {
    expect(validateItemValue(item({ type: "date" }), "not-a-date", tr)).toMatch(
      /日付/,
    );
    expect(
      validateItemValue(item({ type: "date" }), "2026-07-19", tr),
    ).toBeNull();
    expect(validateItemValue(item({ type: "boolean" }), "true", tr)).toBeNull();
    expect(validateItemValue(item({ type: "boolean" }), "maybe", tr)).toMatch(
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
      productItemDefsArraySchema(tr).safeParse(DEFAULT_PRODUCT_ITEM_DEFS)
        .success,
    ).toBe(true);
    expect(
      productTypesArraySchema(tr).safeParse(DEFAULT_PRODUCT_TYPES).success,
    ).toBe(true);
  });

  it("every default assignment references a real definition", () => {
    const keys = new Set(DEFAULT_PRODUCT_ITEM_DEFS.map((d) => d.key));
    for (const t of DEFAULT_PRODUCT_TYPES) {
      for (const a of t.assignments) expect(keys.has(a.itemKey)).toBe(true);
    }
  });
});
