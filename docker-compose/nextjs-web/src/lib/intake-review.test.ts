import { describe, expect, it } from "vitest";
import { reviewIntake, unresolvedFields } from "./intake-review";

/**
 * 「読めなかった」と「読めたが未登録」を区別できることが肝。
 * 対処が違う（前者は書類を見て手入力、後者はマスタ登録）ため、
 * ここが混ざると現場が迷う。
 */

const saved = (over: Partial<Parameters<typeof reviewIntake>[1]> = {}) => ({
  customerBpId: null,
  customerOrderRef: null,
  orderDate: null,
  items: [],
  ...over,
});

const find = (rs: ReturnType<typeof reviewIntake>, key: string) =>
  rs.find((r) => r.key === key);

describe("reviewIntake", () => {
  it("抽出 JSON が無い（手入力）ときは空", () => {
    expect(reviewIntake(null, saved())).toEqual([]);
  });

  it("顧客: 読めてマスタにも一致 → matched", () => {
    const rs = reviewIntake(
      { customer_name: "株式会社オーエムアイ" },
      saved({ customerBpId: "bp-1" }),
    );
    expect(find(rs, "customer")).toMatchObject({
      status: "matched",
      read: "株式会社オーエムアイ",
    });
  });

  it("顧客: 読めたがマスタに無い → unmatched（読み取った名前を出す）", () => {
    const rs = reviewIntake({ customer_name: "株式会社オーエムアイ" }, saved());
    const f = find(rs, "customer");
    expect(f?.status).toBe("unmatched");
    expect(f?.read).toBe("株式会社オーエムアイ");
    expect(f?.hint).toContain("株式会社オーエムアイ");
  });

  it("顧客に自社名が来たら「向きが逆」と分かる案内を出す", () => {
    const rs = reviewIntake(
      { customer_name: "シー・ケイ・ケー株式会社" },
      saved(),
    );
    const f = find(rs, "customer");
    expect(f?.status).toBe("unmatched");
    expect(f?.read).toBe("シー・ケイ・ケー株式会社");
    // 「マスタに無い」ではなく「宛先＝自社／発行元＝顧客」を案内する
    expect(f?.hint).toContain("自社名");
    expect(f?.hint).toContain("発行元");
  });

  it("顧客: そもそも読めなかった → missing", () => {
    const rs = reviewIntake({}, saved());
    expect(find(rs, "customer")).toMatchObject({
      status: "missing",
      read: null,
    });
  });

  it("明細 0 件は明細そのものを missing にする", () => {
    const rs = reviewIntake({ customer_name: "X" }, saved());
    expect(find(rs, "items")?.status).toBe("missing");
  });

  it("製品: 品名は読めたが未突合 → unmatched（品名を出す）", () => {
    const rs = reviewIntake(
      { items: [{ product_name: "特殊ドリル A", quantity: 5 }] },
      saved({
        items: [
          {
            productId: null,
            productText: "特殊ドリル A",
            quantity: 5,
            unitPrice: 100,
          },
        ],
      }),
    );
    const f = find(rs, "item-1-product");
    expect(f?.status).toBe("unmatched");
    expect(f?.read).toBe("特殊ドリル A");
    expect(f?.row).toBe(1);
  });

  it("製品: 突合済みなら明細の指摘は出ない", () => {
    const rs = reviewIntake(
      { items: [{ product_name: "P", quantity: 1 }] },
      saved({
        items: [
          { productId: "12", productText: "P", quantity: 1, unitPrice: 50 },
        ],
      }),
    );
    expect(find(rs, "item-1-product")).toBeUndefined();
    expect(find(rs, "item-1-unitPrice")).toBeUndefined();
  });

  it("単価が空の行は単価を missing にする", () => {
    const rs = reviewIntake(
      { items: [{ product_name: "P", quantity: 1 }] },
      saved({
        items: [
          { productId: "12", productText: "P", quantity: 1, unitPrice: null },
        ],
      }),
    );
    expect(find(rs, "item-1-unitPrice")?.status).toBe("missing");
  });

  it("unresolvedFields は matched / filled を落とす", () => {
    const rs = reviewIntake(
      {
        customer_name: "X",
        order_date: "2026-08-01",
        items: [{ product_name: "P", quantity: 1 }],
      },
      saved({
        customerBpId: "bp-1",
        customerOrderRef: "PO-1",
        orderDate: "2026-08-01",
        items: [
          { productId: "1", productText: "P", quantity: 1, unitPrice: 10 },
        ],
      }),
    );
    expect(unresolvedFields(rs)).toEqual([]);
  });

  it("po-extract の { data: … } 包みでも読める", () => {
    const rs = reviewIntake({ data: { customer_name: "包み" } }, saved());
    expect(find(rs, "customer")?.read).toBe("包み");
  });
});
