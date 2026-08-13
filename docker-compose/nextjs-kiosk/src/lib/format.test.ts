/**
 * format.test.ts — JST 日付整形。とくに `@db.Date` は UTC 深夜で格納・比較
 * されるため、jstDateOnly が「JST 暦日を UTC 深夜に載せる」ことを固定する
 * （JST 深夜 = 前日 15:00Z だと planned_date <= 今日 が本日を取りこぼす）。
 */

import { describe, expect, it } from "vitest";
import { jstDateOnly, jstDateString } from "./format";

describe("jstDateString", () => {
  it("JST の暦日を返す（UTC 深夜前後でも JST の日付）", () => {
    // 2026-08-12 23:00Z = 2026-08-13 08:00 JST
    expect(jstDateString(new Date("2026-08-12T23:00:00Z"))).toBe("2026-08-13");
    // 2026-08-13 14:00Z = 2026-08-13 23:00 JST（まだ同日）
    expect(jstDateString(new Date("2026-08-13T14:00:00Z"))).toBe("2026-08-13");
    // 2026-08-13 15:30Z = 2026-08-14 00:30 JST（翌日）
    expect(jstDateString(new Date("2026-08-13T15:30:00Z"))).toBe("2026-08-14");
  });
});

describe("jstDateOnly", () => {
  it("JST 暦日を UTC 深夜に載せる（@db.Date と同じ表現）", () => {
    // JST で 2026-08-13 のどの瞬間でも、@db.Date の 2026-08-13 = 2026-08-13T00:00:00Z
    expect(jstDateOnly(new Date("2026-08-12T23:00:00Z")).toISOString()).toBe(
      "2026-08-13T00:00:00.000Z",
    );
    expect(jstDateOnly(new Date("2026-08-13T14:00:00Z")).toISOString()).toBe(
      "2026-08-13T00:00:00.000Z",
    );
  });

  it("本日の planned_date <= 今日 が成立する（取りこぼさない）", () => {
    // planned_date 2026-08-13 を Prisma が読むと UTC 深夜
    const plannedToday = new Date("2026-08-13T00:00:00.000Z");
    // 「今日」= JST 2026-08-13 のある瞬間
    const today = jstDateOnly(new Date("2026-08-13T05:00:00Z"));
    expect(plannedToday.getTime() <= today.getTime()).toBe(true);
  });
});
