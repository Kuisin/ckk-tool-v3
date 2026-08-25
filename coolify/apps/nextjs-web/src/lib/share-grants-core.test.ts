import { describe, expect, it } from "vitest";
import {
  resolveShareAccess,
  type ShareGrantRow,
  type ShareSubject,
} from "./share-grants-core";

function subject(over: Partial<ShareSubject> = {}): ShareSubject {
  return {
    userId: "u1",
    plantIds: ["p1"],
    roleIds: ["r1"],
    isOwner: false,
    isSuperuser: false,
    ...over,
  };
}

describe("resolveShareAccess", () => {
  it("共有が無ければ何も与えない", () => {
    expect(resolveShareAccess([], subject())).toEqual({
      canRespond: false,
      canRead: false,
      canEdit: false,
      canManage: false,
    });
  });

  it("作成者と system:ADMIN は常に全権", () => {
    expect(resolveShareAccess([], subject({ isOwner: true })).canManage).toBe(
      true,
    );
    expect(
      resolveShareAccess([], subject({ isSuperuser: true })).canManage,
    ).toBe(true);
  });

  it("EVERYONE は全員に当たる", () => {
    const g: ShareGrantRow[] = [
      { subjectType: "EVERYONE", subjectId: null, level: "READ" },
    ];
    expect(resolveShareAccess(g, subject()).canRead).toBe(true);
  });

  it("PLANT は所属拠点だけ", () => {
    const g: ShareGrantRow[] = [
      { subjectType: "PLANT", subjectId: "p1", level: "READ" },
    ];
    expect(resolveShareAccess(g, subject()).canRead).toBe(true);
    expect(resolveShareAccess(g, subject({ plantIds: ["p9"] })).canRead).toBe(
      false,
    );
  });

  it("ROLE は保持ロールだけ", () => {
    const g: ShareGrantRow[] = [
      { subjectType: "ROLE", subjectId: "r1", level: "EDIT" },
    ];
    expect(resolveShareAccess(g, subject()).canEdit).toBe(true);
    expect(resolveShareAccess(g, subject({ roleIds: [] })).canEdit).toBe(false);
  });

  it("USER は本人だけ", () => {
    const g: ShareGrantRow[] = [
      { subjectType: "USER", subjectId: "u1", level: "MANAGE" },
    ];
    expect(resolveShareAccess(g, subject()).canManage).toBe(true);
    expect(resolveShareAccess(g, subject({ userId: "u2" })).canManage).toBe(
      false,
    );
  });

  it("上位の level は下位を含む", () => {
    const g: ShareGrantRow[] = [
      { subjectType: "EVERYONE", subjectId: null, level: "EDIT" },
    ];
    const a = resolveShareAccess(g, subject());
    expect(a).toEqual({
      canRespond: true,
      canRead: true,
      canEdit: true,
      canManage: false,
    });
  });

  it("RESPOND は READ を含まない（回答はできるが他人の回答は見えない）", () => {
    const g: ShareGrantRow[] = [
      { subjectType: "EVERYONE", subjectId: null, level: "RESPOND" },
    ];
    const a = resolveShareAccess(g, subject());
    expect(a.canRespond).toBe(true);
    expect(a.canRead).toBe(false);
  });

  it("複数行は和集合で解決する", () => {
    const g: ShareGrantRow[] = [
      { subjectType: "EVERYONE", subjectId: null, level: "RESPOND" },
      { subjectType: "ROLE", subjectId: "r1", level: "READ" },
      { subjectType: "PLANT", subjectId: "p9", level: "MANAGE" }, // 当たらない
    ];
    const a = resolveShareAccess(g, subject());
    expect(a).toEqual({
      canRespond: true,
      canRead: true,
      canEdit: false,
      canManage: false,
    });
  });

  it("subjectId が null の PLANT/ROLE/USER は権限を与えない", () => {
    const g: ShareGrantRow[] = [
      { subjectType: "PLANT", subjectId: null, level: "MANAGE" },
      { subjectType: "USER", subjectId: null, level: "MANAGE" },
    ];
    expect(resolveShareAccess(g, subject()).canManage).toBe(false);
  });
});
