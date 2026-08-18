import { describe, expect, it } from "vitest";
import {
  APPROVAL_TARGET,
  APPROVAL_TARGET_TYPES,
  approvalTargetHref,
  approvalTargetLabel,
  isApprovalTargetType,
} from "./approval-targets";

describe("approval targets", () => {
  it("全種別にラベル・色・URL がある", () => {
    for (const t of APPROVAL_TARGET_TYPES) {
      expect(APPROVAL_TARGET[t].label).toBeTruthy();
      expect(APPROVAL_TARGET[t].color).toBeTruthy();
      expect(APPROVAL_TARGET[t].href("X-1")).toContain("X-1");
    }
  });

  it("未知の種別は type guard で弾く", () => {
    expect(isApprovalTargetType("work_orders")).toBe(true);
    expect(isApprovalTargetType("quotes")).toBe(false);
  });

  it("未知の種別はキーをそのまま出し、URL は null", () => {
    expect(approvalTargetLabel("quotes")).toBe("quotes");
    expect(approvalTargetHref("quotes", "QOT-1")).toBeNull();
  });

  it("既知の種別は書類名と詳細 URL を返す", () => {
    expect(approvalTargetLabel("order_acceptances")).toBe("注文請書");
    expect(approvalTargetHref("work_orders", "1042")).toBe(
      "/production/work-orders/1042",
    );
  });
});
