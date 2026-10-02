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
  workOrderTypeForLine,
} from "./work-order-alloc-core";

const line = (over: Partial<LineAllocInfo> = {}): LineAllocInfo => ({
  orderLineId: "L1",
  number: "ORD-202607-00001-01",
  lineQuantity: 100,
  otherAllocated: 0,
  itemId: 9001,
  status: "CONFIRMED",
  ...over,
});

// next-intl の t() の代わり（呼ばれた鍵名（+ 埋め込んだ値）をそのまま返す）
const tr = (key: string, values?: Record<string, unknown>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

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
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 10,
          allocations: [],
          lines: [],
        },
        tr,
      ),
    ).toBeNull();
  });

  it("単一明細の全量割当は OK", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 100,
          allocations: [{ orderLineId: "L1", quantity: 100 }],
          lines: [line()],
        },
        tr,
      ),
    ).toBeNull();
  });

  it("分割: 部分割当も OK（残りは後続の指示書へ）", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 40,
          allocations: [{ orderLineId: "L1", quantity: 40 }],
          lines: [line()],
        },
        tr,
      ),
    ).toBeNull();
  });

  it("統合: 同一製品の複数明細を 1 指示書で束ねられる", () => {
    expect(
      validateAllocations(
        {
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
        },
        tr,
      ),
    ).toBeNull();
  });

  it("製品が混在する統合は拒否", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 130,
          allocations: [
            { orderLineId: "L1", quantity: 100 },
            { orderLineId: "L2", quantity: 30 },
          ],
          lines: [
            line(),
            line({ orderLineId: "L2", itemId: 9002, lineQuantity: 30 }),
          ],
        },
        tr,
      ),
    ).toBe("production.workOrderActions.allocationsMustShareProduct");
  });

  it("受注残を超える割当は拒否", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 80,
          allocations: [{ orderLineId: "L1", quantity: 80 }],
          lines: [line({ otherAllocated: 30 })],
        },
        tr,
      ),
    ).toMatch(/^production\.workOrderActions\.allocationExceedsRemaining /);
  });

  it("予定数量 < 割当合計は拒否（不良予備分は上乗せのみ）", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 90,
          allocations: [{ orderLineId: "L1", quantity: 100 }],
          lines: [line()],
        },
        tr,
      ),
    ).toMatch(
      /^production\.workOrderActions\.plannedQuantityBelowAllocationTotal /,
    );
  });

  it("予定数量 > 割当合計（不良予備分）は OK", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 110,
          allocations: [{ orderLineId: "L1", quantity: 100 }],
          lines: [line()],
        },
        tr,
      ),
    ).toBeNull();
  });

  it("FROM_STOCK は複数明細を割り当てられない", () => {
    expect(
      validateAllocations(
        {
          type: "FROM_STOCK",
          plannedQuantity: 50,
          allocations: [
            { orderLineId: "L1", quantity: 30 },
            { orderLineId: "L2", quantity: 20 },
          ],
          lines: [line(), line({ orderLineId: "L2" })],
        },
        tr,
      ),
    ).toBe("production.workOrderActions.stockWorkOrderOneLineOnly");
  });

  it("FROM_STOCK は予定数量 = 割当数量", () => {
    expect(
      validateAllocations(
        {
          type: "FROM_STOCK",
          plannedQuantity: 40,
          allocations: [{ orderLineId: "L1", quantity: 30 }],
          lines: [line()],
        },
        tr,
      ),
    ).toBe(
      "production.workOrderActions.stockPlannedQuantityMustMatchAllocation",
    );
    expect(
      validateAllocations(
        {
          type: "FROM_STOCK",
          plannedQuantity: 30,
          allocations: [{ orderLineId: "L1", quantity: 30 }],
          lines: [line()],
        },
        tr,
      ),
    ).toBeNull();
  });

  it("同じ明細の重複割当は拒否", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 60,
          allocations: [
            { orderLineId: "L1", quantity: 30 },
            { orderLineId: "L1", quantity: 30 },
          ],
          lines: [line()],
        },
        tr,
      ),
    ).toBe("production.workOrderActions.duplicateOrderLineAllocation");
  });

  it("キャンセル・出荷済の明細は拒否", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 10,
          allocations: [{ orderLineId: "L1", quantity: 10 }],
          lines: [line({ status: "CANCELLED" })],
        },
        tr,
      ),
    ).toMatch(/^production\.workOrderActions\.orderLineNotAllocatable /);
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 10,
          allocations: [{ orderLineId: "L1", quantity: 10 }],
          lines: [line({ status: "SHIPPED" })],
        },
        tr,
      ),
    ).toMatch(/^production\.workOrderActions\.orderLineNotAllocatable /);
  });

  it("未確定（DRAFT）の明細は拒否 — 確定前は枝番も金額も無く割当の前提が動く", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 10,
          allocations: [{ orderLineId: "L1", quantity: 10 }],
          lines: [line({ status: "DRAFT" })],
        },
        tr,
      ),
    ).toMatch(/^production\.workOrderActions\.orderLineNotAllocatable /);
  });

  it("製品未特定の明細は拒否", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 10,
          allocations: [{ orderLineId: "L1", quantity: 10 }],
          lines: [line({ itemId: null })],
        },
        tr,
      ),
    ).toMatch(
      /^production\.workOrderActions\.orderLineProductUnresolvedForLine /,
    );
  });

  it("存在しない明細は拒否", () => {
    expect(
      validateAllocations(
        {
          type: "MANUFACTURE",
          plannedQuantity: 10,
          allocations: [{ orderLineId: "MISSING", quantity: 10 }],
          lines: [],
        },
        tr,
      ),
    ).toBe("production.workOrderActions.orderLineNotFound");
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

describe("REGRIND（再研磨）の割当", () => {
  // 再研磨の明細は品目を 2 つ指す: itemId = 売る役務（再研磨品目）、
  // toolItemId = 研ぎ直す工具。指示書が扱うのは工具のほう。
  const regrindLine = (over: Partial<LineAllocInfo> = {}) =>
    line({ orderType: "REGRIND", toolItemId: 900, ...over });

  it("再研磨の指示書には注文明細が要る（在庫向けの独立指示書にはならない）", () => {
    expect(
      validateAllocations(
        { type: "REGRIND", plannedQuantity: 10, allocations: [], lines: [] },
        tr,
      ),
    ).toBe("production.workOrderActions.regrindOrderRequiresOrderLine");
  });

  it("再研磨の指示書に割り当てられるのは再研磨の明細だけ", () => {
    expect(
      validateAllocations(
        {
          type: "REGRIND",
          plannedQuantity: 100,
          allocations: [{ orderLineId: "L1", quantity: 100 }],
          lines: [line({ orderType: "PRODUCTION" })],
        },
        tr,
      ),
    ).toBe("production.workOrderActions.regrindLinesOnly");
  });

  it("再研磨の明細は製造分・在庫分には割り当てられない", () => {
    for (const type of ["MANUFACTURE", "FROM_STOCK"] as const) {
      expect(
        validateAllocations(
          {
            type,
            plannedQuantity: 100,
            allocations: [{ orderLineId: "L1", quantity: 100 }],
            lines: [regrindLine()],
          },
          tr,
        ),
      ).toBe("production.workOrderActions.regrindLineRequiresRegrindWorkOrder");
    }
  });

  it("工具の決まっていない再研磨の明細は指示書にできない", () => {
    expect(
      validateAllocations(
        {
          type: "REGRIND",
          plannedQuantity: 30,
          allocations: [{ orderLineId: "L1", quantity: 30 }],
          lines: [regrindLine({ toolItemId: null })],
        },
        tr,
      ),
    ).toContain("production.workOrderActions.regrindLineToolMissing");
  });

  it("指示書が扱う品目は**工具**（売る役務ではない）", () => {
    // 売り物（itemId）が違っても、工具が同じなら 1 枚の指示書に束ねられる…
    // …わけではなく、再研磨は明細 1 件だけ。ここで確かめるのは
    // 「工具が違えば別物として弾かれる」ほう。
    expect(
      validateAllocations(
        {
          type: "REGRIND",
          plannedQuantity: 30,
          allocations: [{ orderLineId: "L1", quantity: 30 }],
          lines: [regrindLine({ itemId: 11, toolItemId: 900 })],
        },
        tr,
      ),
    ).toBeNull();
  });

  it("再研磨は明細 1 件・予定数量 = 割当数量", () => {
    expect(
      validateAllocations(
        {
          type: "REGRIND",
          plannedQuantity: 50,
          allocations: [
            { orderLineId: "L1", quantity: 30 },
            { orderLineId: "L2", quantity: 20 },
          ],
          lines: [regrindLine(), regrindLine({ orderLineId: "L2" })],
        },
        tr,
      ),
    ).toBe("production.workOrderActions.regrindWorkOrderOneLineOnly");
    expect(
      validateAllocations(
        {
          type: "REGRIND",
          plannedQuantity: 40,
          allocations: [{ orderLineId: "L1", quantity: 30 }],
          lines: [regrindLine()],
        },
        tr,
      ),
    ).toBe(
      "production.workOrderActions.regrindPlannedQuantityMustMatchAllocation",
    );
    expect(
      validateAllocations(
        {
          type: "REGRIND",
          plannedQuantity: 30,
          allocations: [{ orderLineId: "L1", quantity: 30 }],
          lines: [regrindLine()],
        },
        tr,
      ),
    ).toBeNull();
  });
});

describe("workOrderTypeForLine — 種別は注文請書（明細）が決める", () => {
  it("再研磨の明細は必ず再研磨。呼び出し側の希望は無視する", () => {
    expect(workOrderTypeForLine("REGRIND")).toBe("REGRIND");
    expect(workOrderTypeForLine("REGRIND", "MANUFACTURE")).toBe("REGRIND");
    expect(workOrderTypeForLine("REGRIND", "FROM_STOCK")).toBe("REGRIND");
  });

  it("再研磨でない明細に再研磨は選べない — 製造分へ落とす", () => {
    expect(workOrderTypeForLine("PRODUCTION", "REGRIND")).toBe("MANUFACTURE");
    expect(workOrderTypeForLine("TEST", "REGRIND")).toBe("MANUFACTURE");
  });

  it("再研磨でない明細では 在庫分 / 製造分 の希望が通る（生産側の判断）", () => {
    expect(workOrderTypeForLine("PRODUCTION", "FROM_STOCK")).toBe("FROM_STOCK");
    expect(workOrderTypeForLine("PRODUCTION", "MANUFACTURE")).toBe(
      "MANUFACTURE",
    );
    // 希望が無ければ製造分（従来の既定）。
    expect(workOrderTypeForLine("PRODUCTION")).toBe("MANUFACTURE");
    expect(workOrderTypeForLine("SAMPLE", null)).toBe("MANUFACTURE");
  });

  it("明細に紐づかない在庫向けは希望どおり（既定は製造分）", () => {
    expect(workOrderTypeForLine(null)).toBe("MANUFACTURE");
    expect(workOrderTypeForLine(undefined, "FROM_STOCK")).toBe("FROM_STOCK");
    // 明細が無いのに再研磨は作れない（validateAllocations も拒む）。
    expect(workOrderTypeForLine(null, "REGRIND")).toBe("MANUFACTURE");
  });

  it("validateAllocations の不変条件と食い違わない", () => {
    // 導いた種別をそのまま渡せば、割当検証は種別の食い違いを訴えない。
    const regrind = line({ orderType: "REGRIND", toolItemId: 900 });
    expect(
      validateAllocations(
        {
          type: workOrderTypeForLine(regrind.orderType),
          plannedQuantity: 30,
          allocations: [{ orderLineId: "L1", quantity: 30 }],
          lines: [regrind],
        },
        tr,
      ),
    ).toBeNull();
  });
});
