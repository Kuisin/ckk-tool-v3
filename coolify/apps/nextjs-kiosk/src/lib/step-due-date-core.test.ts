import { describe, expect, it } from "vitest";
import {
  dueDateInstant,
  isStepOverdue,
  jstTodayString,
} from "./step-due-date-core";

describe("jstTodayString", () => {
  it("UTC の夜は JST では翌日", () => {
    expect(jstTodayString(new Date("2026-11-25T15:30:00Z"))).toBe("2026-11-26");
  });
  it("UTC の朝は JST でも同じ日", () => {
    expect(jstTodayString(new Date("2026-11-25T01:00:00Z"))).toBe("2026-11-25");
  });
});

describe("isStepOverdue", () => {
  const today = "2026-11-25";
  it("納期が無ければ遅れない", () => {
    expect(isStepOverdue(null, "PENDING", today)).toBe(false);
  });
  it("納期当日はまだ遅れではない", () => {
    expect(isStepOverdue("2026-11-25", "IN_PROGRESS", today)).toBe(false);
  });
  it("納期を過ぎて未完了なら遅れ", () => {
    expect(isStepOverdue("2026-11-24", "PENDING", today)).toBe(true);
    expect(isStepOverdue("2026-11-24", "IN_PROGRESS", today)).toBe(true);
  });
  it("完了・キャンセルは遅れにしない", () => {
    expect(isStepOverdue("2026-11-01", "COMPLETED", today)).toBe(false);
    expect(isStepOverdue("2026-11-01", "CANCELLED", today)).toBe(false);
  });
});

describe("dueDateInstant", () => {
  it("JST の正午を指す（どの TZ から見ても同じ日）", () => {
    expect(new Date(dueDateInstant("2026-11-25")).toISOString()).toBe(
      "2026-11-25T03:00:00.000Z",
    );
  });
});
