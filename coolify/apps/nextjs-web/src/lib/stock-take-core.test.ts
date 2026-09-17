import { describe, expect, it } from "vitest";
import {
  canCancel,
  canEditCounts,
  canSubmit,
  countedLines,
  differenceCount,
  differenceTotals,
  shouldPost,
  type StockTakeLineInput,
  stockTakeDifference,
} from "./stock-take-core";

const line = (
  book: number,
  counted: number | null,
  live?: number,
): StockTakeLineInput => ({
  bookQuantity: book,
  countedQuantity: counted,
  ...(live === undefined ? {} : { liveQuantity: live }),
});

describe("stockTakeDifference", () => {
  it("数えた数 − 帳簿数（確定時の実数が無いとき）", () => {
    expect(stockTakeDifference(line(10, 8))).toBe(-2);
    expect(stockTakeDifference(line(10, 12))).toBe(2);
    expect(stockTakeDifference(line(10, 10))).toBe(0);
  });

  it("**確定時の実数があればそちらが基準** — 数えてから確定するまでに動いた分を打ち消さない", () => {
    // 取り込み時 10 → その後 4 本出荷されて実数 6 → 数えたら 6（合っている）。
    // 取り込み時点との差 (6-10 = -4) を当てると、正しい出荷を帳消しにしてしまう。
    expect(stockTakeDifference(line(10, 6, 6))).toBe(0);
    // 実数 6 のところを 5 しか無ければ、差異は -1 だけ。
    expect(stockTakeDifference(line(10, 5, 6))).toBe(-1);
  });

  it("未カウントは差異ではない（0 を返し、計上もしない）", () => {
    expect(stockTakeDifference(line(10, null))).toBe(0);
    expect(shouldPost(line(10, null))).toBe(false);
  });

  it("数えて差異ゼロなら計上しない", () => {
    expect(shouldPost(line(10, 10))).toBe(false);
    expect(shouldPost(line(10, 9))).toBe(true);
  });
});

describe("集計", () => {
  const lines = [
    line(10, 8), // -2
    line(5, 5), // 0（数えた・差異なし）
    line(7, null), // 未カウント
    line(3, 6), // +3
  ];

  it("countedLines は数えた行だけ", () => {
    expect(countedLines(lines)).toBe(3);
  });

  it("differenceCount は数えたうえで差異がある行だけ", () => {
    expect(differenceCount(lines)).toBe(2);
  });

  it("過不足は相殺せず別々に出す（±で 1 に見せない）", () => {
    expect(differenceTotals(lines)).toEqual({ over: 3, under: 2 });
  });
});

describe("状態の門", () => {
  it("確定・キャンセル後は数量を書き換えられない", () => {
    expect(canEditCounts({ status: "DRAFT", approvalStatus: "NONE" })).toBe(true);
    expect(canEditCounts({ status: "COUNTING", approvalStatus: "NONE" })).toBe(
      true,
    );
    expect(canEditCounts({ status: "CONFIRMED", approvalStatus: "APPROVED" })).toBe(
      false,
    );
    expect(canEditCounts({ status: "CANCELLED", approvalStatus: "NONE" })).toBe(
      false,
    );
  });

  it("**承認依頼中は書き換えも確定もできない** — 承認を待つ間に当てられるなら承認は何も止めていない", () => {
    const pending = { status: "COUNTING", approvalStatus: "PENDING" } as const;
    expect(canEditCounts(pending)).toBe(false);
    expect(canSubmit(pending, [line(10, 8)])).toBe(false);
  });

  it("差し戻し後は数え直して再依頼できる", () => {
    const rejected = { status: "COUNTING", approvalStatus: "REJECTED" } as const;
    expect(canEditCounts(rejected)).toBe(true);
    expect(canSubmit(rejected, [line(10, 8)])).toBe(true);
  });

  it("1 行も数えていなければ確定に進めない", () => {
    expect(
      canSubmit({ status: "COUNTING", approvalStatus: "NONE" }, [line(10, null)]),
    ).toBe(false);
  });

  it("確定済みはキャンセルできない（戻すなら逆仕訳の棚卸を起こす）", () => {
    expect(canCancel({ status: "COUNTING", approvalStatus: "NONE" })).toBe(true);
    expect(canCancel({ status: "CONFIRMED", approvalStatus: "APPROVED" })).toBe(
      false,
    );
  });
});
