import { describe, expect, it } from "vitest";
import {
  currentRate,
  isBackdatedRate,
  previousDay,
  type RateRow,
  ratePercentLabel,
  ratePeriods,
} from "./model";

const rows: RateRow[] = [
  { id: 1, effectiveFrom: "2019-10-01", rate: 0.1, notes: "" },
  { id: 2, effectiveFrom: "1997-04-01", rate: 0.05, notes: "" },
  { id: 3, effectiveFrom: "2014-04-01", rate: 0.08, notes: "" },
];

describe("previousDay", () => {
  it("前日を返す", () => {
    expect(previousDay("2026-06-04")).toBe("2026-06-03");
  });
  it("月初は前月末へ戻る", () => {
    expect(previousDay("2026-10-01")).toBe("2026-09-30");
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
  });
  it("閏年の 3/1 は 2/29 へ戻る", () => {
    expect(previousDay("2028-03-01")).toBe("2028-02-29");
  });
  it("年初は前年末へ戻る", () => {
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });
});

describe("ratePeriods", () => {
  const periods = ratePeriods(rows, "2026-06-04");

  it("新しい順に並ぶ", () => {
    expect(periods.map((p) => p.effectiveFrom)).toEqual([
      "2019-10-01",
      "2014-04-01",
      "1997-04-01",
    ]);
  });

  it("終了日は次の行の前日、最新は null（＝現在も有効）", () => {
    expect(periods.map((p) => p.effectiveUntil)).toEqual([
      null,
      "2019-09-30",
      "2014-03-31",
    ]);
  });

  it("いま効いている行はちょうど 1 つ", () => {
    expect(periods.filter((p) => p.isCurrent)).toHaveLength(1);
    expect(periods.find((p) => p.isCurrent)?.rate).toBe(0.1);
  });

  it("基準日を過去にすると、その時点の行が current になる", () => {
    const past = ratePeriods(rows, "2015-01-01");
    expect(past.find((p) => p.isCurrent)?.rate).toBe(0.08);
  });

  it("どの行もまだ始まっていなければ current は 0 行", () => {
    const future = ratePeriods(rows, "1990-01-01");
    expect(future.filter((p) => p.isCurrent)).toHaveLength(0);
  });

  it("行が無ければ空", () => {
    expect(ratePeriods([], "2026-06-04")).toEqual([]);
  });
});

describe("currentRate", () => {
  it("lib/tax-rate.ts rateOnDate と同じ結果になる", () => {
    expect(currentRate(rows, "2026-06-04")).toBe(0.1);
    expect(currentRate(rows, "2019-09-30")).toBe(0.08);
    expect(currentRate(rows, "1997-03-31")).toBeNull();
  });
});

describe("ratePercentLabel", () => {
  it("よくある率", () => {
    expect(ratePercentLabel(0.1)).toBe("10%");
    expect(ratePercentLabel(0.08)).toBe("8%");
    expect(ratePercentLabel(0)).toBe("0%");
  });
  it("端数を落とさない（設定した通りに読めること）", () => {
    expect(ratePercentLabel(0.0825)).toBe("8.25%");
    expect(ratePercentLabel(0.1234)).toBe("12.34%");
  });
  it("浮動小数の誤差で 10.000000000000002% にならない", () => {
    expect(ratePercentLabel(0.1 + 0.0)).toBe("10%");
    expect(ratePercentLabel(0.07 + 0.01)).toBe("8%");
  });
});

describe("isBackdatedRate", () => {
  it("過去の日付なら真（まだ確定していない書類がさかのぼって変わる）", () => {
    expect(isBackdatedRate("2026-06-03", "2026-06-04")).toBe(true);
  });
  it("今日・未来は偽", () => {
    expect(isBackdatedRate("2026-06-04", "2026-06-04")).toBe(false);
    expect(isBackdatedRate("2026-10-01", "2026-06-04")).toBe(false);
  });
});
