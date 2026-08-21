/**
 * work-order-alloc-core.test.ts — 指示書 ↔ 注文明細割当（分割・統合）の
 * 純ルールのユニットテスト。
 */

import { describe, expect, it } from "vitest";
import {
  distributeFinished,
  effectiveAllocated,
  type LineAllocInfo,
  remainingAllocatable,
  validateAllocations,
} from "./work-order-alloc-core";

const line = (over: Partial<LineAllocInfo> = {}): LineAllocInfo => ({
  orderLineId: "L1",
  number: "ORD-202607-00001-01",
  lineQuantity: 100,
  otherAllocated: 0,
  productId: 9001,
  status: "CONFIRMED",
  ...over,
});

describe("remainingAllocatable", () => {
  it("受注数量 − 手配済", () => {
    expect(
      remainingAllocatable({ lineQuantity: 100, otherAllocated: 30 }),
    ).toBe(70);
  });
  it("過剰手配は 0 に丸める", () => {
    expect(
      remainingAllocatable({ lineQuantity: 100, otherAllocated: 120 }),
    ).toBe(0);
  });
});

describe("validateAllocations", () => {
  it("割当なし（在庫向けの独立指示書）は OK", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 10,
        allocations: [],
        lines: [],
      }),
    ).toBeNull();
  });

  it("単一明細の全量割当は OK", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 100,
        allocations: [{ orderLineId: "L1", quantity: 100 }],
        lines: [line()],
      }),
    ).toBeNull();
  });

  it("分割: 部分割当も OK（残りは後続の指示書へ）", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 40,
        allocations: [{ orderLineId: "L1", quantity: 40 }],
        lines: [line()],
      }),
    ).toBeNull();
  });

  it("統合: 同一製品の複数明細を 1 指示書で束ねられる", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 130,
        allocations: [
          { orderLineId: "L1", quantity: 100 },
          { orderLineId: "L2", quantity: 30 },
        ],
        lines: [
          line(),
          line({ orderLineId: "L2", number: "ORD-…-02", lineQuantity: 30 }),
        ],
      }),
    ).toBeNull();
  });

  it("製品が混在する統合は拒否", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 130,
        allocations: [
          { orderLineId: "L1", quantity: 100 },
          { orderLineId: "L2", quantity: 30 },
        ],
        lines: [
          line(),
          line({ orderLineId: "L2", productId: 9002, lineQuantity: 30 }),
        ],
      }),
    ).toMatch(/同一製品/);
  });

  it("受注残を超える割当は拒否", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 80,
        allocations: [{ orderLineId: "L1", quantity: 80 }],
        lines: [line({ otherAllocated: 30 })],
      }),
    ).toMatch(/受注残を超えています/);
  });

  it("予定数量 < 割当合計は拒否（不良予備分は上乗せのみ）", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 90,
        allocations: [{ orderLineId: "L1", quantity: 100 }],
        lines: [line()],
      }),
    ).toMatch(/割当合計/);
  });

  it("予定数量 > 割当合計（不良予備分）は OK", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 110,
        allocations: [{ orderLineId: "L1", quantity: 100 }],
        lines: [line()],
      }),
    ).toBeNull();
  });

  it("FROM_STOCK は複数明細を割り当てられない", () => {
    expect(
      validateAllocations({
        type: "FROM_STOCK",
        plannedQuantity: 50,
        allocations: [
          { orderLineId: "L1", quantity: 30 },
          { orderLineId: "L2", quantity: 20 },
        ],
        lines: [line(), line({ orderLineId: "L2" })],
      }),
    ).toMatch(/在庫分/);
  });

  it("FROM_STOCK は予定数量 = 割当数量", () => {
    expect(
      validateAllocations({
        type: "FROM_STOCK",
        plannedQuantity: 40,
        allocations: [{ orderLineId: "L1", quantity: 30 }],
        lines: [line()],
      }),
    ).toMatch(/一致/);
    expect(
      validateAllocations({
        type: "FROM_STOCK",
        plannedQuantity: 30,
        allocations: [{ orderLineId: "L1", quantity: 30 }],
        lines: [line()],
      }),
    ).toBeNull();
  });

  it("同じ明細の重複割当は拒否", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 60,
        allocations: [
          { orderLineId: "L1", quantity: 30 },
          { orderLineId: "L1", quantity: 30 },
        ],
        lines: [line()],
      }),
    ).toMatch(/複数回/);
  });

  it("キャンセル・出荷済の明細は拒否", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 10,
        allocations: [{ orderLineId: "L1", quantity: 10 }],
        lines: [line({ status: "CANCELLED" })],
      }),
    ).toMatch(/割り当てられません/);
  });

  it("製品未特定の明細は拒否", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 10,
        allocations: [{ orderLineId: "L1", quantity: 10 }],
        lines: [line({ productId: null })],
      }),
    ).toMatch(/製品未特定/);
  });

  it("存在しない明細は拒否", () => {
    expect(
      validateAllocations({
        type: "MANUFACTURE",
        plannedQuantity: 10,
        allocations: [{ orderLineId: "MISSING", quantity: 10 }],
        lines: [],
      }),
    ).toMatch(/見つかりません/);
  });
});

describe("effectiveAllocated", () => {
  it("未完了の指示書は割当数のまま数える", () => {
    expect(
      effectiveAllocated([
        { quantity: 40, workOrderStatus: "IN_PROGRESS", finishedShare: null },
        { quantity: 30, workOrderStatus: "DRAFT", finishedShare: null },
      ]),
    ).toBe(70);
  });

  it("完了済みは実際にできた分だけ — 不良の不足分は受注残へ戻る", () => {
    // 割当 50 に対し完成 42（不良 8）→ 手配済みは 42 と数え、残 8 を再手配できる
    expect(
      effectiveAllocated([
        { quantity: 50, workOrderStatus: "COMPLETED", finishedShare: 42 },
      ]),
    ).toBe(42);
  });

  it("完了済みの過剰生産は割当数で頭打ち", () => {
    expect(
      effectiveAllocated([
        { quantity: 50, workOrderStatus: "COMPLETED", finishedShare: 55 },
      ]),
    ).toBe(50);
  });

  it("キャンセル済みは数えない", () => {
    expect(
      effectiveAllocated([
        { quantity: 50, workOrderStatus: "CANCELLED", finishedShare: null },
        { quantity: 20, workOrderStatus: "APPROVED", finishedShare: null },
      ]),
    ).toBe(20);
  });

  it("混在（進行中 + 不足完了）の合算", () => {
    expect(
      effectiveAllocated([
        { quantity: 30, workOrderStatus: "COMPLETED", finishedShare: 25 },
        { quantity: 20, workOrderStatus: "IN_PROGRESS", finishedShare: null },
      ]),
    ).toBe(45);
  });
});

describe("distributeFinished", () => {
  const allocs = [
    { orderLineId: "L1", quantity: 50 },
    { orderLineId: "L2", quantity: 30 },
  ];

  it("完成数を割当順に配分する（二重取りしない）", () => {
    const d = distributeFinished(allocs, 80);
    expect(d.get("L1")).toBe(50);
    expect(d.get("L2")).toBe(30);
  });

  it("不良で減った完成数は後ろの割当から削られる", () => {
    const d = distributeFinished(allocs, 60);
    expect(d.get("L1")).toBe(50);
    expect(d.get("L2")).toBe(10);
  });

  it("完成数 0 は全明細 0", () => {
    const d = distributeFinished(allocs, 0);
    expect(d.get("L1")).toBe(0);
    expect(d.get("L2")).toBe(0);
  });

  it("超過完成（不良予備分が全部良品）は割当までしか配らない", () => {
    const d = distributeFinished(allocs, 100);
    expect(d.get("L1")).toBe(50);
    expect(d.get("L2")).toBe(30);
  });
});
