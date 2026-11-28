import { describe, expect, it } from "vitest";
import { routeKindsForStep } from "./process-route-kinds";

const step = (
  category: string,
  allowed: ("FROM_STOCK" | "MANUFACTURE" | "REGRIND")[] = ["MANUFACTURE"],
  code = "X",
) =>
  ({
    category,
    code,
    allowedWorkOrderTypes: allowed,
  }) as Parameters<typeof routeKindsForStep>[0];

describe("routeKindsForStep", () => {
  it("材料準備は準備だけ", () => {
    expect(
      routeKindsForStep(step("MATERIAL_PREP", ["MANUFACTURE", "REGRIND"])),
    ).toEqual(["PREP"]);
  });

  it("加工は製造", () => {
    expect(routeKindsForStep(step("MACHINING"))).toEqual(["MANUFACTURING"]);
  });

  it("再研磨カテゴリは再研磨だけ（以前は製造と出ていた）", () => {
    expect(routeKindsForStep(step("REGRIND", ["REGRIND"]))).toEqual([
      "REGRIND",
    ]);
  });

  it("再研磨の指示書にも載せられる検査は製造と再研磨の両方", () => {
    expect(
      routeKindsForStep(step("INSPECTION", ["MANUFACTURE", "REGRIND"])),
    ).toEqual(["MANUFACTURING", "REGRIND"]);
  });
});
