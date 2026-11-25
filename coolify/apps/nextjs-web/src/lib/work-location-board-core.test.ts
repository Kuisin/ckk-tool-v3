import { describe, expect, it } from "vitest";
import {
  type BoardLocation,
  type BoardRow,
  groupBoardRows,
  parseBoardDate,
} from "./work-location-board-core";

const loc = (over: Partial<BoardLocation>): BoardLocation => ({
  id: 1,
  code: "M-01",
  name: "1号機",
  groupName: "研削",
  groupSortOrder: 0,
  sortOrder: 0,
  ...over,
});

const row = (over: Partial<BoardRow>): BoardRow => ({
  key: "p1",
  stepId: "s1",
  workOrderNumber: 100,
  docNumber: "WOR-202611-00001",
  productName: "ドリル",
  stepName: "研削",
  stepSortOrder: 0,
  stepStatus: "PENDING",
  reason: "PLANNED",
  plannedDate: "2026-11-25",
  plannedStartAt: null,
  plannedEndAt: null,
  assigneeName: null,
  dueDate: null,
  locationId: 1,
  ...over,
});

describe("groupBoardRows", () => {
  const locations = [
    loc({ id: 1, code: "M-02", sortOrder: 2 }),
    loc({ id: 2, code: "M-01", sortOrder: 1 }),
    loc({ id: 3, code: "A-01", groupSortOrder: -1 }),
  ];

  it("グループ順 → 場所の並び順で束ね、行の無い場所は出さない", () => {
    const groups = groupBoardRows(
      [row({ key: "a", locationId: 1 }), row({ key: "b", locationId: 2 })],
      locations,
    );
    expect(groups.map((g) => g.location?.id)).toEqual([2, 1]);
  });

  it("作業場所の無い行と、マスタに無い場所の行は最後の 1 束", () => {
    const groups = groupBoardRows(
      [
        row({ key: "a", locationId: null }),
        row({ key: "b", locationId: 99 }),
        row({ key: "c", locationId: 3 }),
      ],
      locations,
    );
    expect(groups.map((g) => g.location?.id ?? null)).toEqual([3, null]);
    expect(groups[1].rows.map((r) => r.key).sort()).toEqual(["a", "b"]);
  });

  it("束の中は 開始時刻（無いものは後ろ）→ 指示書番号 → 工程順", () => {
    const groups = groupBoardRows(
      [
        row({ key: "late", plannedStartAt: "2026-11-25T05:00:00.000Z" }),
        row({ key: "none-b", workOrderNumber: 200 }),
        row({ key: "none-a", workOrderNumber: 100, stepSortOrder: 3 }),
        row({ key: "none-a0", workOrderNumber: 100, stepSortOrder: 1 }),
        row({ key: "early", plannedStartAt: "2026-11-25T00:30:00.000Z" }),
      ],
      locations,
    );
    expect(groups[0].rows.map((r) => r.key)).toEqual([
      "early",
      "late",
      "none-a0",
      "none-a",
      "none-b",
    ]);
  });
});

describe("parseBoardDate", () => {
  it("正しい日付だけを通す", () => {
    expect(parseBoardDate("2026-11-25")).toBe("2026-11-25");
    expect(parseBoardDate("2026-02-30")).toBeNull();
    expect(parseBoardDate("20261125")).toBeNull();
    expect(parseBoardDate(null)).toBeNull();
  });
});
