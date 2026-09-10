import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELIVERY_TOLERANCE,
  type DeliveryTolerance,
  deliveredLineStatus,
  evaluateDeliveryVariance,
  lineVariancePermitted,
  toleranceAllowance,
  toleranceLoadLimit,
} from "./delivery-variance-core";

const tol = (p: Partial<DeliveryTolerance> = {}): DeliveryTolerance => ({
  ...DEFAULT_DELIVERY_TOLERANCE,
  ...p,
});

describe("toleranceAllowance", () => {
  it("% 基準は受注数量に掛ける（端数は落とさない）", () => {
    expect(toleranceAllowance(100, tol({ over: 2 }), "over")).toBe(2);
    expect(toleranceAllowance(75, tol({ under: 2 }), "under")).toBe(1.5);
  });

  it("数量基準は受注数量に依らない", () => {
    const t = tol({ basis: "QUANTITY", over: 5 });
    expect(toleranceAllowance(100, t, "over")).toBe(5);
    expect(toleranceAllowance(10, t, "over")).toBe(5);
  });

  it("未設定・0・負・非数はその側を認めない", () => {
    expect(toleranceAllowance(100, tol(), "over")).toBe(0);
    expect(toleranceAllowance(100, tol({ over: 0 }), "over")).toBe(0);
    expect(toleranceAllowance(100, tol({ over: -3 }), "over")).toBe(0);
    expect(toleranceAllowance(100, tol({ over: Number.NaN }), "over")).toBe(0);
  });

  it("受注数量が 0 以下なら % 基準は 0（掛ける相手が無い）", () => {
    expect(toleranceAllowance(0, tol({ over: 50 }), "over")).toBe(0);
    // 数量基準は受注数量を見ないので影響を受けない
    expect(
      toleranceAllowance(0, tol({ basis: "QUANTITY", over: 5 }), "over"),
    ).toBe(5);
  });
});

describe("evaluateDeliveryVariance", () => {
  it("ちょうどは常に承認不要（設定に依らない）", () => {
    const v = evaluateDeliveryVariance({
      orderedQuantity: 100,
      deliveredQuantity: 100,
      tolerance: tol({ approvalWithin: true, approvalOutside: true }),
    });
    expect(v).toMatchObject({
      kind: "EXACT",
      variance: 0,
      withinTolerance: true,
      approvalRequired: false,
    });
  });

  it("範囲内の不足 — 既定は承認不要", () => {
    const v = evaluateDeliveryVariance({
      orderedQuantity: 100,
      deliveredQuantity: 98,
      tolerance: tol({ under: 2 }),
    });
    expect(v.kind).toBe("SHORT");
    expect(v.variance).toBe(-2);
    expect(v.withinTolerance).toBe(true);
    expect(v.approvalRequired).toBe(false);
  });

  it("範囲内でも approvalWithin を立てれば承認が要る", () => {
    const v = evaluateDeliveryVariance({
      orderedQuantity: 100,
      deliveredQuantity: 98,
      tolerance: tol({ under: 2, approvalWithin: true }),
    });
    expect(v.withinTolerance).toBe(true);
    expect(v.approvalRequired).toBe(true);
  });

  it("範囲外は既定で承認必須", () => {
    const v = evaluateDeliveryVariance({
      orderedQuantity: 100,
      deliveredQuantity: 97,
      tolerance: tol({ under: 2 }),
    });
    expect(v.withinTolerance).toBe(false);
    expect(v.approvalRequired).toBe(true);
  });

  it("範囲外でも approvalOutside を降ろせば素通り（顧客の判断）", () => {
    const v = evaluateDeliveryVariance({
      orderedQuantity: 100,
      deliveredQuantity: 50,
      tolerance: tol({ under: 2, approvalOutside: false }),
    });
    expect(v.withinTolerance).toBe(false);
    expect(v.approvalRequired).toBe(false);
  });

  it("不足と超過は別々の幅で判定される", () => {
    const t = tol({ under: 10, over: 1 });
    expect(
      evaluateDeliveryVariance({
        orderedQuantity: 100,
        deliveredQuantity: 92,
        tolerance: t,
      }).withinTolerance,
    ).toBe(true);
    expect(
      evaluateDeliveryVariance({
        orderedQuantity: 100,
        deliveredQuantity: 108,
        tolerance: t,
      }).withinTolerance,
    ).toBe(false);
  });

  it("境界ちょうどは範囲内（≤ で比較する）", () => {
    const v = evaluateDeliveryVariance({
      orderedQuantity: 100,
      deliveredQuantity: 102,
      tolerance: tol({ over: 2 }),
    });
    expect(v.withinTolerance).toBe(true);
  });

  it("既定の設定では、あらゆる過不足が範囲外 = 承認必須", () => {
    for (const delivered of [99, 101]) {
      const v = evaluateDeliveryVariance({
        orderedQuantity: 100,
        deliveredQuantity: delivered,
        tolerance: DEFAULT_DELIVERY_TOLERANCE,
      });
      expect(v.withinTolerance).toBe(false);
      expect(v.approvalRequired).toBe(true);
    }
  });
});

describe("lineVariancePermitted", () => {
  it("1 件でも許可があれば許される（端数の出た最後のロットだけで足りる）", () => {
    expect(
      lineVariancePermitted([
        { allowQuantityVariance: false },
        { allowQuantityVariance: true },
      ]),
    ).toBe(true);
  });

  it("1 件も許可が無ければ従来どおり", () => {
    expect(lineVariancePermitted([{ allowQuantityVariance: false }])).toBe(
      false,
    );
    expect(lineVariancePermitted([])).toBe(false);
  });
});

describe("deliveredLineStatus", () => {
  it("受注数以上なら締め宣言に依らず SHIPPED", () => {
    expect(deliveredLineStatus(100, 100, false)).toBe("SHIPPED");
    expect(deliveredLineStatus(100, 103, false)).toBe("SHIPPED");
  });

  it("不足は宣言があるときだけ SHIPPED、無ければ一部出荷のまま", () => {
    expect(deliveredLineStatus(100, 98, true)).toBe("SHIPPED");
    expect(deliveredLineStatus(100, 98, false)).toBe("PARTIAL_SHIPPED");
  });

  it("納品ゼロは状態を動かさない", () => {
    expect(deliveredLineStatus(100, 0, true)).toBeNull();
  });
});

describe("toleranceLoadLimit", () => {
  it("過不足が許されていなければ受注残まで", () => {
    expect(
      toleranceLoadLimit({
        orderedQuantity: 100,
        otherDeliveredQuantity: 40,
        variancePermitted: false,
        tolerance: tol({ over: 10 }),
      }),
    ).toBe(60);
  });

  it("許されていれば超過幅を足す（本数は切り捨て）— これは注意の線であって保存の上限ではない", () => {
    expect(
      toleranceLoadLimit({
        orderedQuantity: 75,
        otherDeliveredQuantity: 0,
        variancePermitted: true,
        // 75 の 2% = 1.5 → 1 本ぶんだけ多く積める
        tolerance: tol({ over: 2 }),
      }),
    ).toBe(76);
  });

  it("既に積み過ぎていても負の上限を返さない", () => {
    expect(
      toleranceLoadLimit({
        orderedQuantity: 100,
        otherDeliveredQuantity: 120,
        variancePermitted: false,
        tolerance: tol(),
      }),
    ).toBe(0);
  });
});
