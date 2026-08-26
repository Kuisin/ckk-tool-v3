import { describe, expect, it } from "vitest";
import {
  resolveShareAccess,
  responseInScope,
  type ShareCondition,
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
      responseScope: { all: false, conditions: [] },
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
      responseScope: { all: true, conditions: [] },
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
      responseScope: { all: true, conditions: [] },
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

describe("共有の回答条件", () => {
  const subject = {
    userId: "u1",
    plantIds: ["p1"],
    roleIds: ["r1"],
    isOwner: false,
    isSuperuser: false,
  };
  const read = (condition?: ShareCondition | null): ShareGrantRow => ({
    subjectType: "EVERYONE",
    subjectId: null,
    level: "READ",
    condition,
  });

  it("条件なしの READ は全件", () => {
    const a = resolveShareAccess([read()], subject);
    expect(a.responseScope.all).toBe(true);
  });

  it("条件付きの READ は条件だけを持つ", () => {
    const a = resolveShareAccess(
      [read({ fieldKey: "field4", values: ["bp-1"] })],
      subject,
    );
    expect(a.canRead).toBe(true);
    expect(a.responseScope).toEqual({
      all: false,
      conditions: [{ fieldKey: "field4", values: ["bp-1"] }],
    });
  });

  it("条件なしが 1 行でもあれば全件になる（行の和集合）", () => {
    const a = resolveShareAccess(
      [read({ fieldKey: "field4", values: ["bp-1"] }), read()],
      subject,
    );
    expect(a.responseScope.all).toBe(true);
  });

  it("行の順序で結果が変わらない", () => {
    const rows = [read(), read({ fieldKey: "field4", values: ["bp-1"] })];
    expect(resolveShareAccess(rows, subject).responseScope.all).toBe(true);
    expect(
      resolveShareAccess([...rows].reverse(), subject).responseScope.all,
    ).toBe(true);
  });

  it("条件付きが複数あれば足し合わせる", () => {
    const a = resolveShareAccess(
      [
        read({ fieldKey: "field4", values: ["bp-1"] }),
        read({ fieldKey: "field9", values: ["tokyo"] }),
      ],
      subject,
    );
    expect(a.responseScope.conditions).toHaveLength(2);
  });

  it("EDIT はフォームを預かる側なので絞られない", () => {
    const a = resolveShareAccess(
      [
        read({ fieldKey: "field4", values: ["bp-1"] }),
        { subjectType: "EVERYONE", subjectId: null, level: "EDIT" },
      ],
      subject,
    );
    expect(a.responseScope.all).toBe(true);
  });

  it("作成者・管理者は常に全件", () => {
    const rows = [read({ fieldKey: "field4", values: ["bp-1"] })];
    expect(
      resolveShareAccess(rows, { ...subject, isOwner: true }).responseScope.all,
    ).toBe(true);
    expect(
      resolveShareAccess(rows, { ...subject, isSuperuser: true }).responseScope
        .all,
    ).toBe(true);
  });

  it("値が空の条件は絞り込みにならない（全件に倒す）", () => {
    const a = resolveShareAccess(
      [read({ fieldKey: "field4", values: [] })],
      subject,
    );
    expect(a.responseScope.all).toBe(true);
  });
});

describe("responseInScope", () => {
  const scope = (fieldKey: string, values: string[]) => ({
    all: false,
    conditions: [{ fieldKey, values }],
  });

  it("select — 一致する値だけ通す", () => {
    expect(responseInScope(scope("f", ["a"]), { f: "a" })).toBe(true);
    expect(responseInScope(scope("f", ["a"]), { f: "b" })).toBe(false);
  });

  it("multiselect — どれか 1 つ当たれば通す", () => {
    expect(responseInScope(scope("f", ["a"]), { f: ["x", "a"] })).toBe(true);
    expect(responseInScope(scope("f", ["a"]), { f: ["x", "y"] })).toBe(false);
  });

  it("lookup — id で突き合わせる（ラベルは見ない）", () => {
    expect(
      responseInScope(scope("f", ["bp-1"]), {
        f: { id: "bp-1", label: "旧社名" },
      }),
    ).toBe(true);
    // ラベルが一致しても id が違えば通さない
    expect(
      responseInScope(scope("f", ["bp-1"]), {
        f: { id: "bp-2", label: "bp-1" },
      }),
    ).toBe(false);
  });

  it("条件の項目が回答に無ければ見せない（fail-closed）", () => {
    expect(responseInScope(scope("missing", ["a"]), { f: "a" })).toBe(false);
    expect(responseInScope(scope("f", ["a"]), { f: null })).toBe(false);
  });

  it("all なら中身を見ずに通す", () => {
    expect(responseInScope({ all: true, conditions: [] }, {})).toBe(true);
  });

  it("条件ゼロで all でなければ何も見せない", () => {
    expect(responseInScope({ all: false, conditions: [] }, { f: "a" })).toBe(
      false,
    );
  });
});
