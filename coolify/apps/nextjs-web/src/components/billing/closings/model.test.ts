// 締日処理の請求期間（前回締日, 今回締日] と JST 境界 — pure ヘルパーのテスト。

import { describe, expect, it } from "vitest";
import {
  billingPeriodStart,
  billingPeriodStartFrom,
  billingWindowFor,
  closingDateFor,
  closingDateReached,
  inBillingWindow,
  isProcessable,
  isRunnableClosingDate,
  jstMidnightOf,
  parseClosingDate,
  previousClosingDate,
  scheduledClosingDates,
  summarizeClosingSimulation,
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

describe("scheduledClosingDates", () => {
  it("月をまたいで、fromDate 以降・targetDate 以下の締日をすべて返す（月末締め）", () => {
    // 6 月末締めを走らせ忘れ、9 月 15 日に気づいて実行した想定。
    expect(
      scheduledClosingDates(
        utcDate(2026, 6, 15),
        utcDate(2026, 9, 15),
        null, // 31/未設定 = 月末
      ),
    ).toEqual([
      utcDate(2026, 6, 30),
      utcDate(2026, 7, 31),
      utcDate(2026, 8, 31),
    ]);
  });

  it("targetDate の月の締日がまだ来ていなければ含めない", () => {
    // 25 日締めの顧客。9 月 15 日時点では 9 月の締日（25 日）はまだ先。
    expect(
      scheduledClosingDates(utcDate(2026, 9, 1), utcDate(2026, 9, 15), 25),
    ).toEqual([]);
  });

  it("targetDate ちょうどの締日は含める（以下＝境界を含む）", () => {
    expect(
      scheduledClosingDates(utcDate(2026, 8, 1), utcDate(2026, 8, 31), 31),
    ).toEqual([utcDate(2026, 8, 31)]);
  });

  it("fromDate と同じ月でも、fromDate より前の締日は含めない", () => {
    // 10 日締め。fromDate が 15 日なら、今月の 10 日締めはもう過ぎている
    // （このぶんは前回すでに拾われているはずなので二重に返さない）。
    expect(
      scheduledClosingDates(utcDate(2026, 8, 15), utcDate(2026, 9, 30), 10),
    ).toEqual([utcDate(2026, 9, 10)]);
  });

  it("年をまたぐ", () => {
    expect(
      scheduledClosingDates(utcDate(2026, 12, 1), utcDate(2027, 1, 31), 31),
    ).toEqual([utcDate(2026, 12, 31), utcDate(2027, 1, 31)]);
  });

  it("fromDate > targetDate なら空", () => {
    expect(
      scheduledClosingDates(utcDate(2026, 9, 1), utcDate(2026, 8, 1), 31),
    ).toEqual([]);
  });
});

describe("parseClosingDate", () => {
  it("YYYY-MM-DD を UTC 0時の Date にする", () => {
    expect(parseClosingDate("2026-08-31")?.toISOString()).toBe(
      "2026-08-31T00:00:00.000Z",
    );
  });

  it("存在しない日付・不正な形式は null", () => {
    expect(parseClosingDate("2026-02-30")).toBeNull();
    expect(parseClosingDate("2026/08/31")).toBeNull();
    expect(parseClosingDate("20260831")).toBeNull();
    expect(parseClosingDate("")).toBeNull();
  });
});

describe("isProcessable / closingDateReached", () => {
  it("締日当日までは処理できず、翌日から処理できる", () => {
    const c = { status: "PENDING" as const, closingDate: "2026-08-31" };
    expect(isProcessable(c, "2026-08-15")).toBe(false);
    expect(isProcessable(c, "2026-08-31")).toBe(false);
    expect(isProcessable(c, "2026-09-01")).toBe(true);
  });

  it("PENDING 以外は締日を過ぎていても処理できない", () => {
    expect(
      isProcessable(
        { status: "PROCESSED" as const, closingDate: "2026-08-31" },
        "2026-09-10",
      ),
    ).toBe(false);
  });

  it("Date でも文字列でも同じ判定", () => {
    expect(
      closingDateReached(new Date("2026-08-20T00:00:00Z"), "2026-08-21"),
    ).toBe(true);
    expect(closingDateReached("2026-08-20", "2026-08-20")).toBe(false);
  });
});

describe("billingPeriodStartFrom", () => {
  it("前回処理した締日があればその翌日", () => {
    expect(
      billingPeriodStartFrom(
        new Date("2026-08-31T00:00:00Z"),
        31,
        new Date("2026-07-20T00:00:00Z"),
      ).toISOString(),
    ).toBe("2026-07-21T00:00:00.000Z");
  });

  it("無ければ締日設定から計算（従来どおり）", () => {
    expect(
      billingPeriodStartFrom(new Date("2026-08-31T00:00:00Z"), 31, null),
    ).toEqual(billingPeriodStart(2026, 8, 31));
  });
});

describe("isRunnableClosingDate", () => {
  it("今日までは実行してよく、未来日は不可", () => {
    expect(isRunnableClosingDate("2026-09-19", "2026-09-20")).toBe(true);
    expect(isRunnableClosingDate("2026-09-20", "2026-09-20")).toBe(true);
    expect(isRunnableClosingDate("2026-09-21", "2026-09-20")).toBe(false);
    expect(isRunnableClosingDate("2026-09-30", "2026-09-20")).toBe(false);
  });

  it("年をまたいでも文字列比較で正しく並ぶ", () => {
    expect(isRunnableClosingDate("2026-12-31", "2027-01-01")).toBe(true);
    expect(isRunnableClosingDate("2027-01-01", "2026-12-31")).toBe(false);
  });

  /**
   * 実行を今日までに閉じる理由そのもの — 未来日を許すと、締日行は作れるのに
   * 請求書は作れない組み合わせができる。実行の可否（isRunnableClosingDate）と
   * 請求書の可否（closingDateReached）は別の時計を見ているので、ここがずれると
   * 「作成 1 件・請求書 0 件」の半端な状態が黙って残る。
   */
  it("未来日で実行できないので、締日行だけできる組み合わせは作れない", () => {
    const todayIso = "2026-09-20";
    const futureClosing = "2026-09-30";
    // 未来の締日は今日時点では請求書にできない
    expect(closingDateReached(futureClosing, todayIso)).toBe(false);
    // その締日を拾うには指定日を未来にするしかなく、それは実行できない
    expect(isRunnableClosingDate(futureClosing, todayIso)).toBe(false);
  });
});

describe("summarizeClosingSimulation", () => {
  const candidate = (
    customerName: string,
    closingDate: string,
    totalAmount: number,
    shipments = 1,
  ) => ({
    customerName,
    closingDate,
    totalAmount,
    shipmentNumbers: Array.from(
      { length: shipments },
      (_, i) => `DOR-202609-0000${i + 1}`,
    ),
  });

  it("請求書の可否は指定日で決まる（今日ではない）", () => {
    const rows = [candidate("A 社", "2026-09-30", 1000)];
    // 締日の翌日を指定 → その実行なら請求書まで作られる
    expect(
      summarizeClosingSimulation(rows, "2026-10-01").rows[0]
        .willGenerateInvoice,
    ).toBe(true);
    // 締日当日を指定 → まだ（翌日から）
    expect(
      summarizeClosingSimulation(rows, "2026-09-30").rows[0]
        .willGenerateInvoice,
    ).toBe(false);
  });

  it("締日当日は生成されない — closingDateReached と同じ規則", () => {
    const sim = summarizeClosingSimulation(
      [candidate("A 社", "2026-09-30", 1000)],
      "2026-09-30",
    );
    expect(sim.closingCount).toBe(1);
    expect(sim.invoiceCount).toBe(0);
  });

  it("締日 → 顧客名の順に並べ、件数と金額を集計する", () => {
    const sim = summarizeClosingSimulation(
      [
        candidate("B 社", "2026-09-30", 300, 2),
        candidate("A 社", "2026-09-30", 200),
        candidate("C 社", "2026-08-31", 100),
      ],
      "2026-10-01",
    );
    expect(sim.rows.map((r) => r.customerName)).toEqual([
      "C 社",
      "A 社",
      "B 社",
    ]);
    expect(sim.closingCount).toBe(3);
    expect(sim.invoiceCount).toBe(3);
    expect(sim.totalAmount).toBe(600);
    expect(sim.targetDate).toBe("2026-10-01");
  });

  it("締日を過ぎた分と当日の分が混ざっても件数を数え分ける", () => {
    const sim = summarizeClosingSimulation(
      [
        candidate("先月締め", "2026-08-31", 100),
        candidate("当日締め", "2026-09-30", 200),
      ],
      "2026-09-30",
    );
    expect(sim.closingCount).toBe(2);
    expect(sim.invoiceCount).toBe(1);
    expect(sim.totalAmount).toBe(300);
  });

  it("候補が無ければ空（合計 0・元の配列は壊さない）", () => {
    const input: ReturnType<typeof candidate>[] = [];
    const sim = summarizeClosingSimulation(input, "2026-09-20");
    expect(sim.rows).toEqual([]);
    expect(sim.closingCount).toBe(0);
    expect(sim.invoiceCount).toBe(0);
    expect(sim.totalAmount).toBe(0);
  });

  it("DB の完全な ISO 文字列（UTC 0 時）でも暦日で判定する", () => {
    const sim = summarizeClosingSimulation(
      [candidate("A 社", "2026-09-30T00:00:00.000Z", 1000)],
      "2026-10-01",
    );
    expect(sim.rows[0].willGenerateInvoice).toBe(true);
  });
});
