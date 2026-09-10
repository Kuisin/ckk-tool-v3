import { describe, expect, it } from "vitest";
import {
  type PlanReadinessStep,
  planReadiness,
  requiredPlanFields,
} from "./work-plan-core";

const step = (
  over: Partial<PlanReadinessStep> & { stepId: string },
): PlanReadinessStep => ({
  name: over.stepId,
  executionLocation: "INTERNAL",
  status: "PENDING",
  plans: [],
  ...over,
});
const cfg = { workLocationsConfigured: true };

describe("requiredPlanFields", () => {
  it("既定は作業場所だけ（時刻・数量は工程マスタで立てたときだけ）", () => {
    expect(requiredPlanFields({ executionLocation: "INTERNAL" }, cfg)).toEqual([
      "WORK_LOCATION",
    ]);
    expect(
      requiredPlanFields(
        {
          executionLocation: "INTERNAL",
          workLocationRequired: false,
          planTimeRequired: true,
          planQuantityRequired: true,
        },
        cfg,
      ),
    ).toEqual(["TIME", "QUANTITY"]);
  });

  it("外注工程は何も要らない / 作業場所マスタが空なら作業場所は要らない", () => {
    expect(
      requiredPlanFields(
        { executionLocation: "OUTSOURCE", planTimeRequired: true },
        cfg,
      ),
    ).toEqual([]);
    expect(
      requiredPlanFields(
        { executionLocation: "INTERNAL" },
        {
          workLocationsConfigured: false,
        },
      ),
    ).toEqual([]);
  });
});

describe("planReadiness", () => {
  it("社内工程に計画が無ければ NO_PLAN", () => {
    const r = planReadiness([step({ stepId: "a" })], cfg);
    expect(r.ok).toBe(false);
    expect(r.gaps).toEqual([
      { stepId: "a", name: "a", reason: "NO_PLAN", missing: [] },
    ]);
  });

  it("計画はあるが作業場所が無ければ INCOMPLETE + WORK_LOCATION", () => {
    const r = planReadiness(
      [
        step({
          stepId: "a",
          plans: [{ plannedDate: "2026-10-01", workLocationId: null }],
        }),
      ],
      cfg,
    );
    expect(r.gaps[0]).toMatchObject({
      reason: "INCOMPLETE",
      missing: ["WORK_LOCATION"],
    });
  });

  it("時刻・数量を必須にした工程は、片方の時刻だけでは足りない", () => {
    const r = planReadiness(
      [
        step({
          stepId: "a",
          planTimeRequired: true,
          planQuantityRequired: true,
          plans: [
            {
              plannedDate: "2026-10-01",
              workLocationId: 1,
              plannedStartAt: "2026-10-01T09:00:00+09:00",
              plannedEndAt: null,
              quantity: null,
            },
          ],
        }),
      ],
      cfg,
    );
    expect(r.gaps[0].missing).toEqual(["TIME", "QUANTITY"]);
  });

  it("揃った行が 1 行あれば足りる（他の行は不完全でもよい）", () => {
    const r = planReadiness(
      [
        step({
          stepId: "a",
          planTimeRequired: true,
          plans: [
            { plannedDate: "2026-10-01", workLocationId: null },
            {
              plannedDate: new Date("2026-10-02"),
              workLocationId: 3,
              plannedStartAt: new Date("2026-10-02T09:00:00+09:00"),
              plannedEndAt: new Date("2026-10-02T12:00:00+09:00"),
            },
          ],
        }),
      ],
      cfg,
    );
    expect(r.ok).toBe(true);
  });

  it("どの行も揃っていなければ、一番足りないものが少ない行の不足を出す", () => {
    const r = planReadiness(
      [
        step({
          stepId: "a",
          planTimeRequired: true,
          planQuantityRequired: true,
          plans: [
            { plannedDate: "2026-10-01", workLocationId: null }, // 3 つ足りない
            { plannedDate: "2026-10-01", workLocationId: 1, quantity: 5 }, // TIME だけ
          ],
        }),
      ],
      cfg,
    );
    expect(r.gaps[0].missing).toEqual(["TIME"]);
  });

  it("外注工程とキャンセル済み工程は対象外", () => {
    const r = planReadiness(
      [
        step({ stepId: "out", executionLocation: "OUTSOURCE" }),
        step({ stepId: "cancelled", status: "CANCELLED" }),
      ],
      cfg,
    );
    expect(r.ok).toBe(true);
  });

  it("工程マスタで作業場所を「要らない」にした工程は日付だけで足りる", () => {
    const r = planReadiness(
      [
        step({
          stepId: "issue",
          workLocationRequired: false,
          plans: [{ plannedDate: "2026-10-01", workLocationId: null }],
        }),
        step({
          stepId: "cut",
          plans: [{ plannedDate: "2026-10-01", workLocationId: null }],
        }),
      ],
      cfg,
    );
    expect(r.gaps.map((g) => g.stepId)).toEqual(["cut"]);
  });

  it("gaps は渡した工程順", () => {
    const r = planReadiness(
      [step({ stepId: "z" }), step({ stepId: "a" })],
      cfg,
    );
    expect(r.gaps.map((g) => g.stepId)).toEqual(["z", "a"]);
  });
});
