import { describe, expect, it } from "vitest";
import {
  canUpdateRoles,
  describeUserChange,
  isUserChangeKind,
  type RoleChangeContext,
  USER_CHANGE_KINDS,
  updateRolesPayloadSchema,
} from "./user-change-core";

/** テスト用の最小 tr — key をそのまま返す（user-suspension-core.test と同じ）。 */
const tr = ((key: string) => key) as unknown as Parameters<
  typeof canUpdateRoles
>[2];

const ADMIN_ROLE = 1;
const STAFF_ROLE = 2;

const ctx: RoleChangeContext = {
  actorId: "u-actor",
  targetUserId: "u-target",
  knownRoleIds: new Set([ADMIN_ROLE, STAFF_ROLE, 3]),
  adminRoleIds: new Set([ADMIN_ROLE]),
  otherActiveAdminCount: 1,
  targetIsAdmin: false,
};

describe("canUpdateRoles", () => {
  it("通常の付け替えは通る", () => {
    expect(canUpdateRoles([STAFF_ROLE, 3], ctx, tr).ok).toBe(true);
  });

  it("空（全ロールを外す）自体は禁止しない — 権限ゼロは有効な状態", () => {
    expect(canUpdateRoles([], ctx, tr).ok).toBe(true);
  });

  it("自分のロールは変更できない", () => {
    const d = canUpdateRoles(
      [STAFF_ROLE],
      { ...ctx, targetUserId: "u-actor" },
      tr,
    );
    expect(d.ok).toBe(false);
    expect(d.block).toBe("self");
  });

  it("存在しないロール id は当てない", () => {
    const d = canUpdateRoles([STAFF_ROLE, 99], ctx, tr);
    expect(d.ok).toBe(false);
    expect(d.block).toBe("unknown-role");
  });

  it("最後の管理者から管理者ロールを外せない", () => {
    const d = canUpdateRoles(
      [STAFF_ROLE],
      {
        ...ctx,
        targetIsAdmin: true,
        otherActiveAdminCount: 0,
      },
      tr,
    );
    expect(d.ok).toBe(false);
    expect(d.block).toBe("last-admin");
  });

  it("最後の管理者でも、管理者ロールを保ったままなら他は変えられる", () => {
    const d = canUpdateRoles(
      [ADMIN_ROLE, STAFF_ROLE],
      {
        ...ctx,
        targetIsAdmin: true,
        otherActiveAdminCount: 0,
      },
      tr,
    );
    expect(d.ok).toBe(true);
  });

  it("他に管理者が居れば管理者ロールを外せる", () => {
    const d = canUpdateRoles(
      [STAFF_ROLE],
      {
        ...ctx,
        targetIsAdmin: true,
        otherActiveAdminCount: 2,
      },
      tr,
    );
    expect(d.ok).toBe(true);
  });

  // 実在確認を先にやると「存在しないロールで管理者を外す」が unknown-role で
  // 止まる。どちらで止まっても適用されないので順序は自由だが、固定しておく。
  it("実在しないロールと最後の管理者が同時なら、実在確認が先に出る", () => {
    const d = canUpdateRoles(
      [99],
      {
        ...ctx,
        targetIsAdmin: true,
        otherActiveAdminCount: 0,
      },
      tr,
    );
    expect(d.block).toBe("unknown-role");
  });
});

describe("updateRolesPayloadSchema", () => {
  it("正の整数の配列だけを受ける", () => {
    expect(
      updateRolesPayloadSchema.safeParse({ roleIds: [1, 2] }).success,
    ).toBe(true);
    expect(updateRolesPayloadSchema.safeParse({ roleIds: [] }).success).toBe(
      true,
    );
    expect(updateRolesPayloadSchema.safeParse({ roleIds: [0] }).success).toBe(
      false,
    );
    expect(updateRolesPayloadSchema.safeParse({ roleIds: [1.5] }).success).toBe(
      false,
    );
    expect(updateRolesPayloadSchema.safeParse({ roleIds: ["1"] }).success).toBe(
      false,
    );
  });
});

describe("UPDATE_ROLES の要約", () => {
  it("kind として認識される", () => {
    expect(isUserChangeKind("UPDATE_ROLES")).toBe(true);
    expect(USER_CHANGE_KINDS).toContain("UPDATE_ROLES");
  });

  it("名前の対応表があればロール名で出る", () => {
    const names = {
      roles: new Map([
        [1, "管理者"],
        [2, "営業"],
      ]),
    };
    expect(
      describeUserChange("UPDATE_ROLES", { roleIds: [1, 2] }, tr, names),
    ).toBe("common.setRolesTo");
  });

  it("全部外すのは専用の文言になる（空欄にしない）", () => {
    expect(describeUserChange("UPDATE_ROLES", { roleIds: [] }, tr)).toBe(
      "common.removeAllRoles",
    );
  });

  it("payload が壊れていても落ちずに kind 名へ落ちる", () => {
    expect(describeUserChange("UPDATE_ROLES", { nope: true }, tr)).toBe(
      "common.userChangeUpdateRoles",
    );
  });
});
