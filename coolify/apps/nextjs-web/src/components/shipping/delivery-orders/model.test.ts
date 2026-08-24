import { describe, expect, it } from "vitest";
import { allocateLotUsage, combinabilityError } from "./model";

describe("combinabilityError — 1 出荷書に束ねられる条件", () => {
  const ref = (
    over: Partial<{
      customerBpId: string | null;
      shipToBpId: string | null;
      deliveryMethod: string;
    }> = {},
  ) => ({
    customerBpId: "cust-1",
    shipToBpId: null,
    deliveryMethod: "NORMAL",
    ...over,
  });

  it("同一顧客 × 同一出荷先 × 同一配送方法なら null", () => {
    expect(
      combinabilityError([ref(), ref(), ref({ shipToBpId: null })], "cust-1"),
    ).toBeNull();
    expect(
      combinabilityError([
        ref({ shipToBpId: "bp-2" }),
        ref({ shipToBpId: "bp-2" }),
      ]),
    ).toBeNull();
  });

  it("空配列は null（注文明細なしの出荷書）", () => {
    expect(combinabilityError([])).toBeNull();
  });

  it("ヘッダの顧客と食い違うと顧客エラー", () => {
    expect(combinabilityError([ref()], "cust-9")).toMatch(/同じ顧客/);
  });

  it("明細間で顧客が違うと顧客エラー", () => {
    expect(
      combinabilityError([ref(), ref({ customerBpId: "cust-2" })]),
    ).toMatch(/同じ顧客/);
  });

  it("出荷先が違うと出荷先エラー（null と指定ありも別扱い）", () => {
    expect(
      combinabilityError([ref(), ref({ shipToBpId: "bp-2" })], "cust-1"),
    ).toMatch(/同じ出荷先/);
    expect(
      combinabilityError([
        ref({ shipToBpId: "bp-2" }),
        ref({ shipToBpId: "bp-3" }),
      ]),
    ).toMatch(/同じ出荷先/);
  });

  it("配送方法が違うと配送方法エラー", () => {
    expect(
      combinabilityError(
        [ref(), ref({ deliveryMethod: "DIRECT_TO_USER" })],
        "cust-1",
      ),
    ).toMatch(/同じ配送方法/);
  });
});

describe("allocateLotUsage — 未出荷数量のロット割付", () => {
  it("残数ちょうどまで指示書番号順に充当する", () => {
    expect(
      allocateLotUsage(100, [
        { lotNumber: 2, outputQuantity: 60, stockQuantity: 60 },
        { lotNumber: 1, outputQuantity: 60, stockQuantity: 60 },
      ]),
    ).toEqual([
      { lotNumber: 1, quantity: 60 },
      { lotNumber: 2, quantity: 40 }, // 出来高 60 でも必要な 40 だけ
    ]);
  });

  it("統合ロットでは自明細の取り分（outputQuantity）を超えない", () => {
    // 指示書全体の在庫は 100 あるが、この明細の取り分は 30。
    expect(
      allocateLotUsage(80, [
        { lotNumber: 5, outputQuantity: 30, stockQuantity: 100 },
      ]),
    ).toEqual([{ lotNumber: 5, quantity: 30 }]);
  });

  it("現物在庫が取り分より少なければ在庫までしか充当しない", () => {
    expect(
      allocateLotUsage(50, [
        { lotNumber: 3, outputQuantity: 50, stockQuantity: 20 },
        { lotNumber: 4, outputQuantity: 50, stockQuantity: 40 },
      ]),
    ).toEqual([
      { lotNumber: 3, quantity: 20 },
      { lotNumber: 4, quantity: 30 },
    ]);
  });

  it("在庫ゼロのロットは行を作らない", () => {
    expect(
      allocateLotUsage(10, [
        { lotNumber: 1, outputQuantity: 10, stockQuantity: 0 },
        { lotNumber: 2, outputQuantity: 10, stockQuantity: 10 },
      ]),
    ).toEqual([{ lotNumber: 2, quantity: 10 }]);
  });

  it("残数ゼロ以下・ロットなしは空", () => {
    expect(
      allocateLotUsage(0, [
        { lotNumber: 1, outputQuantity: 10, stockQuantity: 10 },
      ]),
    ).toEqual([]);
    expect(allocateLotUsage(-5, [])).toEqual([]);
    expect(allocateLotUsage(10, [])).toEqual([]);
  });
});
