import { describe, expect, it } from "vitest";
import { jstDayRange, jstEndOfDay, jstStartOfDay } from "./jst-day-range";

describe("jst-day-range", () => {
  it("開始は JST 00:00 = 前日 15:00 UTC（サーバー TZ に依らない）", () => {
    expect(jstStartOfDay("2026-09-05").toISOString()).toBe(
      "2026-09-04T15:00:00.000Z",
    );
  });

  it("終了は JST 23:59:59.999 = 当日 14:59:59.999 UTC", () => {
    expect(jstEndOfDay("2026-09-05").toISOString()).toBe(
      "2026-09-05T14:59:59.999Z",
    );
  });

  it("「9/5〜9/5」の代理は 9/5 の JST 一日中ずっと有効", () => {
    const { start, end } = jstDayRange("2026-09-05", "2026-09-05");
    const morningJst = new Date("2026-09-05T00:30:00+09:00");
    const nightJst = new Date("2026-09-05T23:30:00+09:00");
    expect(start <= morningJst && morningJst <= end).toBe(true);
    expect(start <= nightJst && nightJst <= end).toBe(true);
    // 前日の夜・翌日の朝（JST）は範囲外
    expect(new Date("2026-09-04T23:59:59+09:00") < start).toBe(true);
    expect(new Date("2026-09-06T00:00:00+09:00") > end).toBe(true);
  });

  it("UTC 解釈だと 9/5 朝の JST は範囲外になっていた（退行の再現）", () => {
    // 旧実装: `new Date("2026-09-05T00:00:00")` を UTC コンテナで評価した値
    const oldStartInUtcContainer = new Date("2026-09-05T00:00:00Z");
    const morningJst = new Date("2026-09-05T08:00:00+09:00");
    expect(morningJst < oldStartInUtcContainer).toBe(true);
    expect(morningJst >= jstStartOfDay("2026-09-05")).toBe(true);
  });

  it("日付でない文字列は拒否する", () => {
    expect(() => jstStartOfDay("2026/09/05")).toThrow(RangeError);
    expect(() => jstEndOfDay("")).toThrow(RangeError);
  });
});
