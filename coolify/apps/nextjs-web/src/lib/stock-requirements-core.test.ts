import { describe, expect, it } from "vitest";
import {
  buildStockRequirementsTimeline,
  type FutureElementInput,
  type PastMovementInput,
} from "./stock-requirements-core";

const past = (over: Partial<PastMovementInput> = {}): PastMovementInput => ({
  occurredAt: "2026-09-01T00:00:00.000Z",
  transactionType: "IN",
  quantity: 10,
  ref: null,
  refHref: null,
  note: null,
  ...over,
});

const future = (
  over: Partial<FutureElementInput> = {},
): FutureElementInput => ({
  kind: "supply",
  date: "2026-09-10",
  quantity: 10,
  ref: "REF",
  refHref: null,
  ...over,
});

describe("buildStockRequirementsTimeline — 並び順", () => {
  it("過去は古い順、未来は日付昇順に並ぶ", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 30,
      reserved: 0,
      pastMovements: [
        past({ occurredAt: "2026-09-03T00:00:00.000Z", ref: "b" }),
        past({ occurredAt: "2026-09-01T00:00:00.000Z", ref: "a" }),
      ],
      futureElements: [
        future({ date: "2026-09-20", ref: "later" }),
        future({ date: "2026-09-10", ref: "sooner" }),
      ],
    });
    const refs = t.rows.map((r) => r.ref);
    expect(refs).toEqual(["a", "b", null, "sooner", "later"]);
  });

  it("日付未定の未来要素は最後に置かれる", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 0,
      reserved: 0,
      pastMovements: [],
      futureElements: [
        future({ date: null, ref: "undated" }),
        future({ date: "2026-09-05", ref: "dated" }),
      ],
    });
    const refs = t.rows.filter((r) => r.kind !== "now").map((r) => r.ref);
    expect(refs).toEqual(["dated", "undated"]);
  });

  it("同日の複数要素はそれぞれ独立した行のまま（集約しない）", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 0,
      reserved: 0,
      pastMovements: [],
      futureElements: [
        future({ date: "2026-09-10", ref: "po-1", quantity: 5 }),
        future({ date: "2026-09-10", ref: "po-2", quantity: 3 }),
      ],
    });
    const supplyRows = t.rows.filter((r) => r.kind === "supply");
    expect(supplyRows).toHaveLength(2);
    expect(supplyRows.map((r) => r.ref)).toEqual(["po-1", "po-2"]);
  });
});

describe("buildStockRequirementsTimeline — 残高（累積）", () => {
  it("いま（now）の残高は 手持ち − 予約", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 50,
      reserved: 20,
      pastMovements: [],
      futureElements: [],
    });
    expect(t.availableNow).toBe(30);
    const nowRow = t.rows.find((r) => r.kind === "now");
    expect(nowRow?.balance).toBe(30);
  });

  it("過去行の残高は手持ち数（now の直前）に矛盾なくつながる", () => {
    // 過去: +10 (IN) → -4 (OUT) → 現在の手持ちは 6 のはず
    const t = buildStockRequirementsTimeline({
      onHand: 6,
      reserved: 0,
      pastMovements: [
        past({
          occurredAt: "2026-09-01T00:00:00.000Z",
          transactionType: "IN",
          quantity: 10,
        }),
        past({
          occurredAt: "2026-09-02T00:00:00.000Z",
          transactionType: "OUT",
          quantity: 4,
        }),
      ],
      futureElements: [],
    });
    const pastRows = t.rows.filter((r) => r.kind === "past");
    expect(pastRows[0].balance).toBe(10);
    expect(pastRows[1].balance).toBe(6);
    // now 行（予約 0）も同じ 6 に一致する
    expect(t.rows.find((r) => r.kind === "now")?.balance).toBe(6);
  });

  it("RESERVE/RELEASE は物理残高（past 行の balance）を動かさない", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 10,
      reserved: 3,
      pastMovements: [
        past({
          occurredAt: "2026-09-01T00:00:00.000Z",
          transactionType: "IN",
          quantity: 10,
        }),
        past({
          occurredAt: "2026-09-02T00:00:00.000Z",
          transactionType: "RESERVE",
          quantity: 3,
        }),
      ],
      futureElements: [],
    });
    const pastRows = t.rows.filter((r) => r.kind === "past");
    // RESERVE 行の残高（物理在庫）は直前と同じ 10 のまま
    expect(pastRows[1].balance).toBe(10);
    // 行自体の「数量」は予約が増えたことを示す +3
    expect(pastRows[1].quantity).toBe(3);
    // now は 手持ち10 − 予約3 = 7
    expect(t.availableNow).toBe(7);
  });

  it("未来は available を起点に供給(+)・需要(-) を積む", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 10,
      reserved: 0,
      pastMovements: [],
      futureElements: [
        future({
          kind: "demand",
          date: "2026-09-05",
          quantity: 4,
          ref: "wo-1",
        }),
        future({
          kind: "supply",
          date: "2026-09-10",
          quantity: 6,
          ref: "po-1",
        }),
      ],
    });
    const rows = t.rows.filter((r) => r.kind !== "past" && r.kind !== "now");
    expect(rows[0]).toMatchObject({ kind: "demand", quantity: -4, balance: 6 });
    expect(rows[1]).toMatchObject({ kind: "supply", quantity: 6, balance: 12 });
  });
});

describe("buildStockRequirementsTimeline — 需要が供給を上回る（欠品）", () => {
  it("残高が初めて負になった行を firstNegative で示す", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 10,
      reserved: 0,
      pastMovements: [],
      futureElements: [
        future({
          kind: "demand",
          date: "2026-09-05",
          quantity: 8,
          ref: "wo-1",
        }),
        future({
          kind: "demand",
          date: "2026-09-06",
          quantity: 5,
          ref: "wo-2",
        }),
        future({
          kind: "supply",
          date: "2026-09-20",
          quantity: 100,
          ref: "po-1",
        }),
      ],
    });
    expect(t.firstNegative).not.toBeNull();
    expect(t.firstNegative?.ref).toBe("wo-2");
    expect(t.firstNegative?.balance).toBe(-3);
    // その後の供給で持ち直しても、最初に負になった行がそのまま報告される
    const lastRow = t.rows.at(-1);
    expect(lastRow?.balance).toBe(97);
  });

  it("一度も負にならなければ firstNegative は null", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 100,
      reserved: 0,
      pastMovements: [],
      futureElements: [
        future({
          kind: "demand",
          quantity: 10,
          date: "2026-09-05",
          ref: "wo-1",
        }),
      ],
    });
    expect(t.firstNegative).toBeNull();
  });

  it("今すでに欠品（now の時点で負）なら now 行が firstNegative になる", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 5,
      reserved: 8,
      pastMovements: [],
      futureElements: [],
    });
    expect(t.firstNegative?.kind).toBe("now");
    expect(t.firstNegative?.balance).toBe(-3);
  });
});

describe("buildStockRequirementsTimeline — 次回入荷日", () => {
  it("日付が決まっている最初の供給日を返す（需要・日付未定は無視）", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 0,
      reserved: 0,
      pastMovements: [],
      futureElements: [
        future({ kind: "demand", date: "2026-09-01", ref: "wo-1" }),
        future({ kind: "supply", date: null, ref: "po-undated" }),
        future({ kind: "supply", date: "2026-09-15", ref: "po-1" }),
        future({ kind: "supply", date: "2026-09-30", ref: "po-2" }),
      ],
    });
    expect(t.nextReceiptDate).toBe("2026-09-15");
  });

  it("確定供給が無ければ null", () => {
    const t = buildStockRequirementsTimeline({
      onHand: 0,
      reserved: 0,
      pastMovements: [],
      futureElements: [
        future({ kind: "demand", date: "2026-09-01", ref: "wo-1" }),
      ],
    });
    expect(t.nextReceiptDate).toBeNull();
  });
});
