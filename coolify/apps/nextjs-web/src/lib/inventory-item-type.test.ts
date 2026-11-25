import { describe, expect, it } from "vitest";
import { inventoryTypeOf, isStockedItemType } from "./inventory-item-type";

describe("inventoryTypeOf", () => {
  it("製品・素材はそのまま", () => {
    expect(inventoryTypeOf("PRODUCT")).toBe("PRODUCT");
    expect(inventoryTypeOf("MATERIAL")).toBe("MATERIAL");
  });

  it("仕掛ブランクは製品の台帳（本で数える）", () => {
    expect(inventoryTypeOf("BLANK")).toBe("PRODUCT");
    expect(isStockedItemType("BLANK")).toBe(true);
  });

  it("再研磨（役務）は在庫を持たない", () => {
    expect(isStockedItemType("REGRIND")).toBe(false);
    expect(() => inventoryTypeOf("REGRIND")).toThrow();
  });
});
