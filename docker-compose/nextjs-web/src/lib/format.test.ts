import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "./format";

// 表示は JST（Asia/Tokyo）固定 — UTC の ISO を 9 時間進めて表示する。
describe("format (JST)", () => {
  it("formatDateTime converts UTC ISO to JST", () => {
    expect(formatDateTime("2026-08-13T04:26:00.000Z")).toBe("2026/08/13 13:26");
    // 日付またぎ: UTC 15:30 → JST 翌日 00:30
    expect(formatDateTime("2026-08-13T15:30:00.000Z")).toBe("2026/08/14 00:30");
  });

  it("formatDate keeps calendar date in JST", () => {
    expect(formatDate("2026-08-13T20:00:00.000Z")).toBe("2026/08/14");
    // 日付のみ（UTC 深夜 0 時扱い）はそのままの日付になる
    expect(formatDate("2026-08-13")).toBe("2026/08/13");
  });

  it("formatTime renders HH:mm in JST", () => {
    expect(formatTime("2026-08-13T04:05:00.000Z")).toBe("13:05");
  });

  it("handles null / invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });
});
