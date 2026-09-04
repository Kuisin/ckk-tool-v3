// 締日処理の請求期間（前回締日, 今回締日] と JST 境界 — pure ヘルパーのテスト。

import { describe, expect, it } from "vitest";
import {
  autorunTargetMonths,
  billingPeriodStart,
  billingWindowFor,
  closingDateFor,
  inBillingWindow,
  jstMidnightOf,
  previousClosingDate,
} from "./model";

/** JST の日時 → Date（UTC 瞬間）。 */
const jst = (iso: string) => new Date(`${iso}+09:00`);
const utcDate = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d));

describe("closingDateFor", () => {
  it("31 / null は月末、月の日数を超える値も月末", () => {
    expect(closingDateFor(2026, 2, 31)).toEqual(utcDate(2026, 2, 28));
    expect(closingDateFor(2026, 2, null)).toEqual(utcDate(2026, 2, 28));
    expect(closingDateFor(2026, 2, 30)).toEqual(utcDate(2026, 2, 28));
    expect(closingDateFor(2028, 2, 31)).toEqual(utcDate(2028, 2, 29));
  });

  it("1–30 はその日", () => {
    expect(closingDateFor(2026, 7, 20)).toEqual(utcDate(2026, 7, 20));
  });
});

describe("previousClosingDate / billingPeriodStart", () => {
  it("前月の締日。1 月は前年 12 月", () => {
    expect(previousClosingDate(2026, 7, 20)).toEqual(utcDate(2026, 6, 20));
    expect(previousClosingDate(2026, 1, 20)).toEqual(utcDate(2025, 12, 20));
  });

  it("月末指定は前月の月末（日数が違っても）", () => {
    expect(previousClosingDate(2026, 3, 31)).toEqual(utcDate(2026, 2, 28));
    expect(previousClosingDate(2026, 8, null)).toEqual(utcDate(2026, 7, 31));
  });

  it("請求期間の開始日 = 前回締日の翌日", () => {
    expect(billingPeriodStart(2026, 7, 20)).toEqual(utcDate(2026, 6, 21));
    expect(billingPeriodStart(2026, 3, 31)).toEqual(utcDate(2026, 3, 1));
  });
});

describe("jstMidnightOf", () => {
  it("暦日の JST 0 時 = UTC 前日 15:00", () => {
    expect(jstMidnightOf(utcDate(2026, 7, 21))).toEqual(
      new Date("2026-07-20T15:00:00.000Z"),
    );
    expect(jstMidnightOf(utcDate(2026, 7, 21))).toEqual(
      jst("2026-07-21T00:00:00"),
    );
  });
});

describe("billingWindowFor", () => {
  it("締日 20 日: (6/20, 7/20] を JST 0 時で切る", () => {
    const w = billingWindowFor(2026, 7, 20);
    expect(w.closingDate).toEqual(utcDate(2026, 7, 20));
    expect(w.gte).toEqual(jst("2026-06-21T00:00:00"));
    expect(w.lt).toEqual(jst("2026-07-21T00:00:00"));
  });

  it("月末締め: (6/30, 7/31]", () => {
    const w = billingWindowFor(2026, 7, null);
    expect(w.closingDate).toEqual(utcDate(2026, 7, 31));
    expect(w.gte).toEqual(jst("2026-07-01T00:00:00"));
    expect(w.lt).toEqual(jst("2026-08-01T00:00:00"));
  });

  it("締日より後の出荷は翌月の期間に入る（どの締めにも落ちない）", () => {
    const shipped = jst("2026-07-25T10:00:00");
    expect(inBillingWindow(shipped, billingWindowFor(2026, 7, 20))).toBe(false);
    expect(inBillingWindow(shipped, billingWindowFor(2026, 8, 20))).toBe(true);
  });

  it("隣り合う月の期間は隙間も重なりも無い", () => {
    const jul = billingWindowFor(2026, 7, 20);
    const aug = billingWindowFor(2026, 8, 20);
    expect(aug.gte).toEqual(jul.lt);
  });

  it("締日当日の JST 23:59 は含み、翌日 JST 0:00 は含まない", () => {
    const w = billingWindowFor(2026, 7, 31);
    expect(inBillingWindow(jst("2026-07-31T23:59:59"), w)).toBe(true);
    expect(inBillingWindow(jst("2026-08-01T00:00:00"), w)).toBe(false);
  });

  it("JST 0〜9 時の出荷は UTC では前日だが、JST の暦日で判定する", () => {
    // 7/21 JST 03:00 = 7/20 UTC 18:00 — 締日 7/20 の期間には入らない
    const shipped = jst("2026-07-21T03:00:00");
    expect(inBillingWindow(shipped, billingWindowFor(2026, 7, 20))).toBe(false);
    expect(inBillingWindow(shipped, billingWindowFor(2026, 8, 20))).toBe(true);
  });
});

describe("autorunTargetMonths", () => {
  it("月初 3 日間は前月 → 当月の順に 2 か月", () => {
    expect(autorunTargetMonths(2026, 8, 1)).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
    expect(autorunTargetMonths(2026, 8, 3)).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });

  it("4 日目からは当月だけ", () => {
    expect(autorunTargetMonths(2026, 8, 4)).toEqual([{ year: 2026, month: 8 }]);
  });

  it("1 月の月初は前年 12 月", () => {
    expect(autorunTargetMonths(2027, 1, 2)).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });
});
