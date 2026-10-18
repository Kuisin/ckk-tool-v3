import { describe, expect, it } from "vitest";
import {
  type ChargeItemRef,
  chargeInputError,
  chargesTotal,
  defaultUnitPriceFor,
  isUnitPriceEditable,
  resolveChargeLine,
  resolveChargeUnitPrice,
} from "./charge-core";

const fixed: ChargeItemRef = {
  id: 1,
  amountMode: "FIXED",
  defaultAmount: 500,
};
const variable: ChargeItemRef = {
  id: 2,
  amountMode: "VARIABLE",
  defaultAmount: 1200,
};
const variableNoDefault: ChargeItemRef = {
  id: 3,
  amountMode: "VARIABLE",
  defaultAmount: null,
};

describe("isUnitPriceEditable", () => {
  it("固定はいじれない / 可変はいじれる", () => {
    expect(isUnitPriceEditable(fixed)).toBe(false);
    expect(isUnitPriceEditable(variable)).toBe(true);
  });
});

describe("resolveChargeUnitPrice", () => {
  it("固定はマスタの金額が勝つ — 送られてきた値を無視する", () => {
    expect(resolveChargeUnitPrice(fixed, 9999)).toBe(500);
    expect(resolveChargeUnitPrice(fixed, null)).toBe(500);
  });

  it("可変は入れた金額を使う", () => {
    expect(resolveChargeUnitPrice(variable, 800)).toBe(800);
  });

  it("可変で未入力ならマスタの既定値へ落ちる", () => {
    expect(resolveChargeUnitPrice(variable, null)).toBe(1200);
    expect(resolveChargeUnitPrice(variableNoDefault, null)).toBe(0);
  });

  it("可変に 0 を入れたら 0（既定値へ戻さない — 無償対応の記録）", () => {
    expect(resolveChargeUnitPrice(variable, 0)).toBe(0);
  });
});

describe("defaultUnitPriceFor", () => {
  it("入力欄の既定値", () => {
    expect(defaultUnitPriceFor(fixed)).toBe(500);
    expect(defaultUnitPriceFor(variable)).toBe(1200);
    expect(defaultUnitPriceFor(variableNoDefault)).toBeNull();
  });
});

describe("chargeInputError", () => {
  it("正しい行は null", () => {
    expect(
      chargeInputError({ chargeItemId: 1, quantity: 1 }, fixed),
    ).toBeNull();
    expect(
      chargeInputError(
        { chargeItemId: 2, quantity: 2, unitPrice: 300 },
        variable,
      ),
    ).toBeNull();
  });

  it("料金マスタが見つからない", () => {
    expect(chargeInputError({ chargeItemId: 9, quantity: 1 }, undefined)).toBe(
      "master.chargeItems.unknownChargeItem",
    );
  });

  it("数量は 1 以上の整数", () => {
    for (const quantity of [0, -1, 1.5]) {
      expect(chargeInputError({ chargeItemId: 1, quantity }, fixed)).toBe(
        "master.chargeItems.quantityMin1",
      );
    }
  });

  it("固定なのに金額が決まっていないのは設定漏れ（0 円で黙って通さない）", () => {
    expect(
      chargeInputError(
        { chargeItemId: 4, quantity: 1 },
        { id: 4, amountMode: "FIXED", defaultAmount: null },
      ),
    ).toBe("master.chargeItems.fixedNeedsAmount");
  });

  it("0 円は認める（無償対応の記録）", () => {
    expect(
      chargeInputError(
        { chargeItemId: 2, quantity: 1, unitPrice: 0 },
        variable,
      ),
    ).toBeNull();
  });

  it("負の金額は認めない（値引きは価格表の責務）", () => {
    expect(
      chargeInputError(
        { chargeItemId: 2, quantity: 1, unitPrice: -100 },
        variable,
      ),
    ).toBe("master.chargeItems.amountCannotBeNegative");
  });
});

describe("resolveChargeLine", () => {
  it("金額は数量 × 単価を円へ丸めて持つ", () => {
    expect(
      resolveChargeLine(
        { chargeItemId: 2, quantity: 3, unitPrice: 333.4 },
        variable,
      ),
    ).toEqual({ chargeItemId: 2, quantity: 3, unitPrice: 333.4, amount: 1000 });
  });

  it("固定はマスタの金額で計算する", () => {
    expect(
      resolveChargeLine({ chargeItemId: 1, quantity: 2, unitPrice: 1 }, fixed),
    ).toEqual({ chargeItemId: 1, quantity: 2, unitPrice: 500, amount: 1000 });
  });
});

describe("chargesTotal", () => {
  it("行の金額を足す（掛け算をやり直さない）", () => {
    expect(chargesTotal([{ amount: 1000 }, { amount: 500 }])).toBe(1500);
    expect(chargesTotal([])).toBe(0);
  });
});
