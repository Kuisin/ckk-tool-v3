import { describe, expect, it } from "vitest";
import { shippableQuantity } from "./work-order-shipping-core";

describe("shippableQuantity", () => {
  it("明細が無ければ 0（在庫向けの独立指示書）", () => {
    expect(shippableQuantity([])).toBe(0);
  });

  it("受注数 − 出荷済 を足す", () => {
    expect(
      shippableQuantity([
        { quantity: 50, shippedQuantity: 20 },
        { quantity: 100, shippedQuantity: 0 },
      ]),
    ).toBe(130);
  });

  it("全量出荷済みなら 0 — フォームが「出荷済み」と返すのと揃える", () => {
    expect(shippableQuantity([{ quantity: 50, shippedQuantity: 50 }])).toBe(0);
  });

  it("受注数を超えて出荷済みでも負にしない", () => {
    expect(shippableQuantity([{ quantity: 50, shippedQuantity: 100 }])).toBe(0);
  });

  it("超過した明細が、別の明細の残数を食い潰さない", () => {
    // 合計してから 0 で切ると (50-100)+(100-0) = 50 になり、
    // 出せる 100 本が 50 本に見える。明細ごとに切ること。
    expect(
      shippableQuantity([
        { quantity: 50, shippedQuantity: 100 },
        { quantity: 100, shippedQuantity: 0 },
      ]),
    ).toBe(100);
  });

  it("下書きも数えるので、フォームより残数は必ず少なめに出る", () => {
    // 受注 100 / SHIPPED 40 / 下書きに 30 載っている、という状態。
    // フォーム（SHIPPED だけ）は残 60、こちらは残 30 と見る。
    // カードが出る ⇒ フォームは必ず受け付ける、という向きが保たれる。
    const shippedOnly = 100 - 40;
    const arranged = shippableQuantity([
      { quantity: 100, shippedQuantity: 40 + 30 },
    ]);
    expect(arranged).toBe(30);
    expect(arranged).toBeLessThanOrEqual(shippedOnly);
  });
});
