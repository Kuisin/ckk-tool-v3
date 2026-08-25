import { describe, expect, it } from "vitest";
import {
  canRestore,
  canSuspend,
  resolveDisabledUntil,
  type SuspensionContext,
  type SuspensionTarget,
  suspensionState,
} from "./user-suspension-core";

const NOW = new Date("2026-09-01T09:00:00Z");

const target: SuspensionTarget = {
  id: "u-target",
  username: "t.yamada",
  isActive: true,
  disabledUntil: null,
};

const ctx: SuspensionContext = {
  actorId: "u-actor",
  otherActiveAdminCount: 2,
  targetIsAdmin: false,
};

describe("canSuspend", () => {
  it("allows suspending an ordinary active user", () => {
    expect(canSuspend(target, ctx).ok).toBe(true);
  });

  it("refuses to suspend yourself", () => {
    const d = canSuspend(target, { ...ctx, actorId: target.id });
    expect(d.ok).toBe(false);
    expect(d.block).toBe("self");
  });

  it("refuses the last admin", () => {
    const d = canSuspend(target, {
      ...ctx,
      targetIsAdmin: true,
      otherActiveAdminCount: 0,
    });
    expect(d.ok).toBe(false);
    expect(d.block).toBe("last-admin");
  });

  it("allows an admin while another admin remains", () => {
    expect(
      canSuspend(target, {
        ...ctx,
        targetIsAdmin: true,
        otherActiveAdminCount: 1,
      }).ok,
    ).toBe(true);
  });

  it("refuses when already disabled", () => {
    const d = canSuspend({ ...target, isActive: false }, ctx);
    expect(d.ok).toBe(false);
    expect(d.block).toBe("already-disabled");
  });

  it("checks self before the admin rule", () => {
    // 自分が最後の管理者でもあるとき、返る理由は "self" であってほしい
    // （「他の管理者を作れ」より「自分は止められない」のほうが行動に直結する）。
    const d = canSuspend(target, {
      actorId: target.id,
      targetIsAdmin: true,
      otherActiveAdminCount: 0,
    });
    expect(d.block).toBe("self");
  });
});

describe("canRestore", () => {
  it("restores a disabled user", () => {
    expect(canRestore({ ...target, isActive: false }).ok).toBe(true);
  });
  it("refuses an already-active user", () => {
    const d = canRestore(target);
    expect(d.ok).toBe(false);
    expect(d.block).toBe("already-active");
  });
});

describe("resolveDisabledUntil", () => {
  it("returns null for permanent regardless of the date given", () => {
    const r = resolveDisabledUntil("permanent", new Date("2027-01-01"), NOW);
    expect(r).toEqual({ ok: true, value: null });
  });

  it("requires a date for temporary", () => {
    const r = resolveDisabledUntil("temporary", null, NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects a past date", () => {
    // 過去を許すと「止めた直後に自動復帰」になり、故障にしか見えない。
    const r = resolveDisabledUntil(
      "temporary",
      new Date("2026-08-31T09:00:00Z"),
      NOW,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects exactly now", () => {
    const r = resolveDisabledUntil("temporary", new Date(NOW), NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid date", () => {
    const r = resolveDisabledUntil("temporary", new Date("nope"), NOW);
    expect(r.ok).toBe(false);
  });

  it("accepts a future date", () => {
    const until = new Date("2026-09-08T09:00:00Z");
    expect(resolveDisabledUntil("temporary", until, NOW)).toEqual({
      ok: true,
      value: until,
    });
  });
});

describe("suspensionState", () => {
  it("says nothing for an active user", () => {
    expect(suspensionState(target, NOW)).toEqual({
      kind: null,
      label: null,
      isAwaitingRestore: false,
    });
  });

  it("labels a permanent suspension", () => {
    const s = suspensionState({ ...target, isActive: false }, NOW);
    expect(s.kind).toBe("permanent");
    expect(s.label).toContain("無期限");
  });

  it("labels a live temporary suspension", () => {
    const s = suspensionState(
      {
        ...target,
        isActive: false,
        disabledUntil: new Date("2026-09-08T09:00:00Z"),
      },
      NOW,
    );
    expect(s.kind).toBe("temporary");
    expect(s.isAwaitingRestore).toBe(false);
  });

  it("explains the up-to-one-minute gap after expiry", () => {
    // 復帰係は毎分なので、期限直後は「無効のまま」に見える瞬間がある。
    const s = suspensionState(
      {
        ...target,
        isActive: false,
        disabledUntil: new Date("2026-09-01T08:59:30Z"),
      },
      NOW,
    );
    expect(s.isAwaitingRestore).toBe(true);
    expect(s.label).toContain("自動復帰");
  });
});
