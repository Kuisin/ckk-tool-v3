import { describe, expect, it } from "vitest";
import { approvalInboxWhere } from "./approval-inbox-core";

describe("approvalInboxWhere", () => {
  const U = "00000000-0000-0000-0000-000000000001";

  it("PENDING だけを対象にする", () => {
    expect(approvalInboxWhere(U, [1]).status).toBe("PENDING");
  });

  it("グループ宛は自分が承認できるグループだけ（重複は畳む）", () => {
    expect(approvalInboxWhere(U, [3, 1, 3]).OR[0]).toEqual({
      groupId: { in: [3, 1] },
    });
  });

  it("グループが 1 つも無くても個人宛の枠は拾う", () => {
    const w = approvalInboxWhere(U, []);
    expect(w.OR).toEqual([
      { groupId: { in: [] } },
      { groupId: null, approvers: { some: { userId: U } } },
    ]);
  });

  it("全員の段で自分がもう押した依頼は外す", () => {
    expect(approvalInboxWhere(U, [1]).NOT).toEqual({
      mode: "ALL",
      approvers: { some: { userId: U, actedAt: { not: null } } },
    });
  });
});
