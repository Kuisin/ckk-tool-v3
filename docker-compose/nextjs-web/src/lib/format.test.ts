import { describe, expect, it } from "vitest";
import { createFormatters, documentFormatters } from "./format";
import { DEFAULT_PREFERENCES } from "./user-preferences-core";

const jst = documentFormatters; // 既定 = 日本語 / JST / yyyy/MM/dd / 24h

// 既定（従来の挙動）— JST 固定で UTC の ISO を 9 時間進めて表示する。
describe("format (既定 = JST)", () => {
  it("dateTime converts UTC ISO to JST", () => {
    expect(jst.dateTime("2026-08-13T04:26:00.000Z")).toBe("2026/08/13 13:26");
    // 日付またぎ: UTC 15:30 → JST 翌日 00:30
    expect(jst.dateTime("2026-08-13T15:30:00.000Z")).toBe("2026/08/14 00:30");
  });

  it("date keeps calendar date in JST", () => {
    expect(jst.date("2026-08-13T20:00:00.000Z")).toBe("2026/08/14");
    // 日付のみ（UTC 深夜 0 時扱い）はそのままの日付になる
    expect(jst.date("2026-08-13")).toBe("2026/08/13");
  });

  it("time renders HH:mm in JST", () => {
    expect(jst.time("2026-08-13T04:05:00.000Z")).toBe("13:05");
  });

  it("handles null / invalid input", () => {
    expect(jst.date(null)).toBe("—");
    expect(jst.dateTime(undefined)).toBe("—");
    expect(jst.dateTime("not-a-date")).toBe("—");
  });
});

// ユーザーの表示設定 — 保存値（UTC）は変えず、読み替えだけが変わる。
describe("表示設定ごとの整形", () => {
  it("タイムゾーンで暦日ごと変わる", () => {
    const utc = createFormatters({ ...DEFAULT_PREFERENCES, timeZone: "UTC" });
    const ny = createFormatters({
      ...DEFAULT_PREFERENCES,
      timeZone: "America/New_York",
    });
    // 同じ瞬間が、JST では翌日・UTC では当日 20:00・NY では当日 16:00
    expect(jst.dateTime("2026-08-13T20:00:00.000Z")).toBe("2026/08/14 05:00");
    expect(utc.dateTime("2026-08-13T20:00:00.000Z")).toBe("2026/08/13 20:00");
    expect(ny.dateTime("2026-08-13T20:00:00.000Z")).toBe("2026/08/13 16:00");
  });

  it("日付の並びは設定どおり（ロケール既定に引きずられない）", () => {
    const iso = "2026-03-05T01:00:00.000Z"; // JST 10:00
    const mk = (dateFormat: "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY") =>
      createFormatters({ ...DEFAULT_PREFERENCES, dateFormat });
    expect(mk("YYYY-MM-DD").date(iso)).toBe("2026-03-05");
    expect(mk("DD/MM/YYYY").date(iso)).toBe("05/03/2026");
    expect(mk("MM/DD/YYYY").date(iso)).toBe("03/05/2026");
    // 英語ロケールでも並びは設定が勝つ
    const enUs = createFormatters({
      ...DEFAULT_PREFERENCES,
      locale: "en",
      dateFormat: "YYYY/MM/DD",
    });
    expect(enUs.date(iso)).toBe("2026/03/05");
  });

  it("12 時間表記", () => {
    const ampm = createFormatters({
      ...DEFAULT_PREFERENCES,
      locale: "en",
      timeFormat: "12h",
    });
    expect(ampm.time("2026-08-13T05:30:00.000Z")).toBe("02:30 PM");
  });

  it("{ja,en} フィールドは言語設定で選ぶ（zh は英語へ）", () => {
    const value = { ja: "製品", en: "Product" };
    expect(jst.localized(value)).toBe("製品");
    expect(
      createFormatters({ ...DEFAULT_PREFERENCES, locale: "en" }).localized(
        value,
      ),
    ).toBe("Product");
    expect(
      createFormatters({ ...DEFAULT_PREFERENCES, locale: "zh" }).localized(
        value,
      ),
    ).toBe("Product");
  });
});
