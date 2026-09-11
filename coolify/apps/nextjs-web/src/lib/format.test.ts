import { describe, expect, it } from "vitest";
import {
  createFormatters,
  documentFormatters,
  localizedTranslations,
  zonedDayRange,
} from "./format";
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

  it("{ja,en} フィールドは言語設定で選ぶ（zh はデータが無ければ英語へ）", () => {
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

  it("zh キーがあれば zh の人にはそちらを見せる（可変キー・_specs/i18n-glossary.md §2.10）", () => {
    const value = { ja: "製品", en: "Product", zh: "产品" };
    expect(
      createFormatters({ ...DEFAULT_PREFERENCES, locale: "zh" }).localized(
        value,
      ),
    ).toBe("产品");
    // 追加の言語キーは ja/en の読み替えに影響しない
    expect(jst.localized(value)).toBe("製品");
  });

  it("localized は空データで '—'、未知ロケールは ja へ落ちる", () => {
    expect(jst.localized(null)).toBe("—");
    expect(jst.localized({ ja: "" })).toBe("—");
    expect(
      createFormatters({
        ...DEFAULT_PREFERENCES,
        // biome-ignore lint/suspicious/noExplicitAny: 未対応ロケールの防御を試す
        locale: "ko" as any,
      }).localized({ ja: "製品" }),
    ).toBe("製品");
  });
});

describe("localizedTranslations（多言語ポップアップの初期値）", () => {
  it("ja とオート補完された en（ja と同一）を除く", () => {
    expect(localizedTranslations({ ja: "製品", en: "製品" })).toEqual({});
  });

  it("実際に入力された en / zh は残す", () => {
    expect(
      localizedTranslations({ ja: "製品", en: "Product", zh: "产品" }),
    ).toEqual({ en: "Product", zh: "产品" });
  });

  it("null/undefined は空オブジェクト", () => {
    expect(localizedTranslations(null)).toEqual({});
    expect(localizedTranslations(undefined)).toEqual({});
  });
});

describe("zonedDayRange（日付範囲フィルタの UTC 変換）", () => {
  it("JST は UTC 0 時と 9 時間ずれる", () => {
    const r = zonedDayRange("2026-08-13", "Asia/Tokyo");
    expect(r).not.toBeNull();
    // 2026-08-13 の JST の 1 日 = UTC 2026-08-12 15:00 〜 2026-08-13 15:00
    expect(r?.gte.toISOString()).toBe("2026-08-12T15:00:00.000Z");
    expect(r?.lt.toISOString()).toBe("2026-08-13T15:00:00.000Z");
  });

  it("UTC はそのまま 0 時〜翌日 0 時", () => {
    const r = zonedDayRange("2026-08-13", "UTC");
    expect(r?.gte.toISOString()).toBe("2026-08-13T00:00:00.000Z");
    expect(r?.lt.toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });

  it("月末・年末をまたいでも翌暦日を正しく進める", () => {
    const r = zonedDayRange("2026-12-31", "Asia/Tokyo");
    expect(r?.gte.toISOString()).toBe("2026-12-30T15:00:00.000Z");
    expect(r?.lt.toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });

  it("DST の切り替わり日をまたいでも 24 時間とは限らない幅を正しく計算する", () => {
    // 2026-03-08 は米国東部で夏時間開始（2:00 AM → 3:00 AM）。
    // その日の現地 0 時〜翌日 0 時は 24 時間のまま（開始時刻が 0 時ではない
    // ため）だが、UTC 側のオフセットは日をまたいで -5→-4 に変わる。
    const r = zonedDayRange("2026-03-08", "America/New_York");
    expect(r?.gte.toISOString()).toBe("2026-03-08T05:00:00.000Z"); // EST (UTC-5)
    expect(r?.lt.toISOString()).toBe("2026-03-09T04:00:00.000Z"); // EDT (UTC-4)
  });

  it("不正な形式は null", () => {
    expect(zonedDayRange("2026/08/13", "Asia/Tokyo")).toBeNull();
    expect(zonedDayRange("not-a-date", "Asia/Tokyo")).toBeNull();
  });
});
