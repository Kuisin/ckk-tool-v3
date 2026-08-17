import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  workOrderNumberLabel,
} from "./format";

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

describe("workOrderNumberLabel", () => {
  it("作成日 + 通し連番 5 桁で表示する", () => {
    expect(workOrderNumberLabel(1, "2026-08-13T05:00:00.000Z")).toBe(
      "20260813-00001",
    );
    expect(workOrderNumberLabel(12345, "2026-01-05T00:00:00.000Z")).toBe(
      "20260105-12345",
    );
  });

  it("JST の暦日で採る（UTC 深夜は翌日扱い）", () => {
    // 2026-08-13T16:00Z = 2026-08-14 01:00 JST
    expect(workOrderNumberLabel(7, "2026-08-13T16:00:00.000Z")).toBe(
      "20260814-00007",
    );
  });

  it("日付が無ければ従来表記にフォールバック", () => {
    expect(workOrderNumberLabel(42, null)).toBe("#42");
    expect(workOrderNumberLabel(42)).toBe("#42");
  });

  it("番号が無ければダッシュ", () => {
    expect(workOrderNumberLabel(null, "2026-08-13T05:00:00.000Z")).toBe("—");
  });
});
