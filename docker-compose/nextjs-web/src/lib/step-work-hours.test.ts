import { describe, expect, it } from "vitest";
import { sumActualWorkHours } from "./step-work-hours";

const at = (iso: string) => new Date(iso);

describe("sumActualWorkHours", () => {
  it("実績が無ければ null（0 時間ではない）", () => {
    expect(sumActualWorkHours([])).toBeNull();
  });

  it("1 セッションの開始〜終了を h で返す", () => {
    expect(
      sumActualWorkHours([
        {
          startedAt: at("2026-08-20T01:00:00Z"),
          endedAt: at("2026-08-20T03:30:00Z"),
        },
      ]),
    ).toBe(2.5);
  });

  it("複数セッションを足す（一時停止した間は入らない）", () => {
    expect(
      sumActualWorkHours([
        {
          startedAt: at("2026-08-20T01:00:00Z"),
          endedAt: at("2026-08-20T02:00:00Z"),
        },
        // 02:00〜05:00 は一時停止 — 行が無いので数えない
        {
          startedAt: at("2026-08-20T05:00:00Z"),
          endedAt: at("2026-08-20T06:30:00Z"),
        },
      ]),
    ).toBe(2.5);
  });

  it("作業中（終了なし）の行は無視する", () => {
    expect(
      sumActualWorkHours([
        {
          startedAt: at("2026-08-20T01:00:00Z"),
          endedAt: at("2026-08-20T02:00:00Z"),
        },
        { startedAt: at("2026-08-20T05:00:00Z"), endedAt: null },
      ]),
    ).toBe(1);
  });

  it("数えられる行が 1 つも無ければ null", () => {
    expect(
      sumActualWorkHours([
        { startedAt: at("2026-08-20T05:00:00Z"), endedAt: null },
      ]),
    ).toBeNull();
  });

  it("終了が開始より前の行は無視する（入力ミス）", () => {
    expect(
      sumActualWorkHours([
        {
          startedAt: at("2026-08-20T05:00:00Z"),
          endedAt: at("2026-08-20T04:00:00Z"),
        },
        {
          startedAt: at("2026-08-20T06:00:00Z"),
          endedAt: at("2026-08-20T07:00:00Z"),
        },
      ]),
    ).toBe(1);
  });

  it("ISO 文字列でも Date でも同じ", () => {
    expect(
      sumActualWorkHours([
        { startedAt: "2026-08-20T01:00:00Z", endedAt: "2026-08-20T01:45:00Z" },
      ]),
    ).toBe(0.75);
  });

  it("小数第 2 位まで丸める", () => {
    // 20 分 = 0.3333… h
    expect(
      sumActualWorkHours([
        {
          startedAt: at("2026-08-20T01:00:00Z"),
          endedAt: at("2026-08-20T01:20:00Z"),
        },
      ]),
    ).toBe(0.33);
  });

  it("同時実行セグメントは duration / concurrent_count で按分する", () => {
    // 2h を 2 工程同時 → 1h 扱い。未指定/1 以下は従来どおり
    expect(
      sumActualWorkHours([
        {
          startedAt: at("2026-08-20T01:00:00Z"),
          endedAt: at("2026-08-20T03:00:00Z"),
          concurrentCount: 2,
        },
        {
          startedAt: at("2026-08-20T04:00:00Z"),
          endedAt: at("2026-08-20T05:00:00Z"),
          concurrentCount: null,
        },
      ]),
    ).toBe(2);
    expect(
      sumActualWorkHours([
        {
          startedAt: at("2026-08-20T01:00:00Z"),
          endedAt: at("2026-08-20T02:00:00Z"),
          concurrentCount: 0,
        },
      ]),
    ).toBe(1);
  });
});
