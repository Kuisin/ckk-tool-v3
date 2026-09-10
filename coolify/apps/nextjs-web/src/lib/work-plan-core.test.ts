import { describe, expect, it } from "vitest";
import { type PlanReadinessStep, planReadiness } from "./work-plan-core";

const step = (
  over: Partial<PlanReadinessStep> & { stepId: string },
): PlanReadinessStep => ({
  name: over.stepId,
  executionLocation: "INTERNAL",
  status: "PENDING",
  plans: [],
  ...over,
});

describe("planReadiness", () => {
  it("社内工程に計画が無ければ NO_PLAN", () => {
    const r = planReadiness([step({ stepId: "a" })], {
      workLocationsConfigured: true,
    });
    expect(r.ok).toBe(false);
    expect(r.gaps).toEqual([{ stepId: "a", name: "a", reason: "NO_PLAN" }]);
  });

  it("計画はあるが作業場所が無ければ NO_LOCATION", () => {
    const r = planReadiness(
      [
        step({
          stepId: "a",
          plans: [{ plannedDate: "2026-10-01", workLocationId: null }],
        }),
      ],
      { workLocationsConfigured: true },
    );
    expect(r.gaps.map((g) => g.reason)).toEqual(["NO_LOCATION"]);
  });

  it("日付 + 作業場所の揃った計画が 1 行あれば足りる（他の行は不完全でもよい）", () => {
    const r = planReadiness(
      [
        step({
          stepId: "a",
          plans: [
            { plannedDate: "2026-10-01", workLocationId: null },
            { plannedDate: new Date("2026-10-02"), workLocationId: 3 },
          ],
        }),
      ],
      { workLocationsConfigured: true },
    );
    expect(r.ok).toBe(true);
  });

  it("外注工程とキャンセル済み工程は対象外", () => {
    const r = planReadiness(
      [
        step({ stepId: "out", executionLocation: "OUTSOURCE" }),
        step({ stepId: "cancelled", status: "CANCELLED" }),
      ],
      { workLocationsConfigured: true },
    );
    expect(r.ok).toBe(true);
  });

  it("作業場所マスタが空なら作業場所は要求しない（日付は要る）", () => {
    const r = planReadiness(
      [
        step({
          stepId: "a",
          plans: [{ plannedDate: "2026-10-01", workLocationId: null }],
        }),
        step({
          stepId: "b",
          plans: [{ plannedDate: null, workLocationId: 1 }],
        }),
      ],
      { workLocationsConfigured: false },
    );
    expect(r.gaps.map((g) => g.stepId)).toEqual(["b"]);
  });

  it("gaps は渡した工程順", () => {
    const r = planReadiness([step({ stepId: "z" }), step({ stepId: "a" })], {
      workLocationsConfigured: true,
    });
    expect(r.gaps.map((g) => g.stepId)).toEqual(["z", "a"]);
  });
});
