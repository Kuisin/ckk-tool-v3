/**
 * atp-core.test.ts — 素材 ATP 純ロジックのユニットテスト。
 */

import { describe, expect, it } from "vitest";
import { atpNow, availableOn, buildAtpTimeline } from "./atp-core";

describe("atpNow", () => {
  it("on-hand − reserved", () => {
    expect(atpNow({ onHand: 100, reserved: 30, expectedReceipts: [] })).toBe(
      70,
    );
  });

  it("予約超過はマイナス（発注判断のシグナル）", () => {
    expect(atpNow({ onHand: 10, reserved: 25, expectedReceipts: [] })).toBe(
      -15,
    );
  });
});

describe("buildAtpTimeline", () => {
  it("入荷なし → 現時点行のみ", () => {
    const t = buildAtpTimeline({
      onHand: 5,
      reserved: 2,
      expectedReceipts: [],
    });
    expect(t).toEqual([{ date: null, delta: 0, available: 3, refs: [] }]);
  });

  it("日付順に累積・同日はマージ", () => {
    const t = buildAtpTimeline({
      onHand: 10,
      reserved: 15,
      expectedReceipts: [
        { date: "2026-08-01", quantity: 20, ref: "PO-202607-00002" },
        { date: "2026-07-20", quantity: 5, ref: "PO-202607-00001" },
        { date: "2026-08-01", quantity: 10, ref: "PO-202607-00003" },
      ],
    });
    expect(t.map((p) => [p.date, p.delta, p.available])).toEqual([
      [null, 0, -5],
      ["2026-07-20", 5, 0],
      ["2026-08-01", 30, 30],
    ]);
    expect(t[2].refs).toEqual(["PO-202607-00002", "PO-202607-00003"]);
  });

  it("日付未定は末尾（9999-12-31 マーカー）", () => {
    const t = buildAtpTimeline({
      onHand: 0,
      reserved: 0,
      expectedReceipts: [
        { date: null, quantity: 7, ref: "PO-X" },
        { date: "2026-07-20", quantity: 3 },
      ],
    });
    expect(t[t.length - 1].date).toBe("9999-12-31");
    expect(t[t.length - 1].available).toBe(10);
  });
});

describe("availableOn", () => {
  const input = {
    onHand: 10,
    reserved: 5,
    expectedReceipts: [
      { date: "2026-07-20", quantity: 5 },
      { date: "2026-08-01", quantity: 20 },
      { date: null, quantity: 99 }, // 未定は含まない
    ],
  };

  it("入荷前の日付 → 現時点値", () => {
    expect(availableOn(input, "2026-07-19")).toBe(5);
  });

  it("入荷日ちょうどは含む", () => {
    expect(availableOn(input, "2026-07-20")).toBe(10);
  });

  it("すべての確定入荷後（未定は除外）", () => {
    expect(availableOn(input, "2026-12-31")).toBe(30);
  });
});
