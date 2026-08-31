import { describe, expect, it } from "vitest";
import {
  describeFlowChange,
  FLOW_CHANGE_KINDS,
  isFlowChangeGated,
  requiresApproval,
} from "./flow-change-core";

describe("requiresApproval — 未設定なら素通し", () => {
  it("段が 1 つも無ければ承認を挟まない", () => {
    expect(requiresApproval(0)).toBe(false);
  });

  it("段が 1 つでもあれば承認を挟む", () => {
    expect(requiresApproval(1)).toBe(true);
    expect(requiresApproval(3)).toBe(true);
  });
});

describe("isFlowChangeGated — どの指示書で承認が要るか", () => {
  it("承認済み・進行中は承認の対象", () => {
    expect(isFlowChangeGated("APPROVED")).toBe(true);
    expect(isFlowChangeGated("IN_PROGRESS")).toBe(true);
  });

  it("下書き・承認依頼中は対象外（普通に編集できる段階）", () => {
    expect(isFlowChangeGated("DRAFT")).toBe(false);
    expect(isFlowChangeGated("PENDING_APPROVAL")).toBe(false);
  });

  it("完了・キャンセルも対象外（工程を触る操作自体が止まる）", () => {
    expect(isFlowChangeGated("COMPLETED")).toBe(false);
    expect(isFlowChangeGated("CANCELLED")).toBe(false);
  });
});

describe("describeFlowChange", () => {
  it("追加は工程数と数量を出す", () => {
    expect(
      describeFlowChange(FLOW_CHANGE_KINDS.ADD_BRANCH, {
        catalogStepIds: [1, 2],
        routedQuantity: 4,
      }),
    ).toBe("分岐の追加（2 工程 / 数量 4）");
  });

  it("削除は見出しだけ", () => {
    expect(
      describeFlowChange(FLOW_CHANGE_KINDS.REMOVE_BRANCH, { headStepId: "x" }),
    ).toBe("分岐の削除");
  });

  it("未知の種別はそのまま出す（空白にしない）", () => {
    expect(describeFlowChange("FUTURE", null)).toBe("FUTURE");
  });
});
