import { describe, expect, it } from "vitest";
import {
  effectivePolicy,
  LEGACY_EMPTY,
  resolveApprovalNeed,
} from "./approval-policy-core";
import { APPROVAL_TARGET_TYPES } from "./approval-targets";

describe("resolveApprovalNeed", () => {
  const r = (
    policy: "on" | "off" | null,
    stepCount: number,
    legacyEmpty: "block" | "skip",
  ) => resolveApprovalNeed({ policy, stepCount, legacyEmpty });

  it("OFF は段があっても承認なしで進める", () => {
    expect(r("off", 3, "block")).toBe("skip");
    expect(r("off", 0, "block")).toBe("skip");
  });

  it("ON は段があれば承認、無ければ依頼できない（従来の素通しも止める）", () => {
    expect(r("on", 1, "skip")).toBe("flow");
    expect(r("on", 0, "skip")).toBe("blocked");
    expect(r("on", 0, "block")).toBe("blocked");
  });

  it("設定が無ければ今までどおり", () => {
    expect(r(null, 2, "skip")).toBe("flow");
    expect(r(null, 0, "skip")).toBe("skip");
    expect(r(null, 0, "block")).toBe("blocked");
  });
});

describe("effectivePolicy", () => {
  it("設定が無い素通し種別で段が無ければ OFF と表示する", () => {
    expect(
      effectivePolicy({ policy: null, stepCount: 0, legacyEmpty: "skip" }),
    ).toBe("off");
    expect(
      effectivePolicy({ policy: null, stepCount: 0, legacyEmpty: "block" }),
    ).toBe("on");
  });
});

describe("LEGACY_EMPTY", () => {
  it("フォーム以外の全種別を持つ（種別を足したらここも決める）", () => {
    expect(Object.keys(LEGACY_EMPTY).sort()).toEqual(
      APPROVAL_TARGET_TYPES.filter((t) => t !== "form_responses").sort(),
    );
  });
});
