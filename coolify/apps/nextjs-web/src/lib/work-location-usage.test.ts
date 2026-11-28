import { describe, expect, it } from "vitest";
import { MASTER_REFERENCES, referenceKey } from "./master-refs";
import {
  WORK_LOCATION_USAGE_MESSAGES,
  workLocationUsage,
} from "./work-location-usage";

describe("workLocationUsage", () => {
  it("数える関連（MASTER_REFERENCES.WorkLocation）すべてに文言がある", () => {
    const counted = MASTER_REFERENCES.WorkLocation.map(referenceKey).sort();
    expect(Object.keys(WORK_LOCATION_USAGE_MESSAGES).sort()).toEqual(counted);
  });

  it("件数のある関連だけを文言にする", () => {
    const tr = (key: string, v: { count: number }) => `${key}:${v.count}`;
    expect(
      workLocationUsage(tr, {
        "WorkOrderStepPlan.workLocationId": 2,
        "OrderLine.shippingWorkLocationId": 1,
        "KioskDevice.defaultWorkLocationId": 0,
      }),
    ).toEqual([
      "master.workLocationsActions.usedByStepPlans:2",
      "master.workLocationsActions.usedByOrderLines:1",
    ]);
  });
});
