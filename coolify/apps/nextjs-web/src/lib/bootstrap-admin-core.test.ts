import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_ADMIN_USERNAME,
  bootstrapAdminState,
  isBootstrapAdmin,
} from "./bootstrap-admin-core";

const base = {
  username: BOOTSTRAP_ADMIN_USERNAME,
  isActive: true,
  passwordChangeRequired: false,
  otherActiveAdminCount: 0,
};

describe("isBootstrapAdmin", () => {
  it("matches only the seeded local account", () => {
    expect(isBootstrapAdmin("admin")).toBe(true);
    expect(isBootstrapAdmin("k.sawada")).toBe(false);
    // 紛らわしい名前を巻き込まないこと（前方一致にしない）。
    expect(isBootstrapAdmin("administrator")).toBe(false);
    expect(isBootstrapAdmin("admin2")).toBe(false);
  });
});

describe("bootstrapAdminState", () => {
  it("says nothing about ordinary users", () => {
    const s = bootstrapAdminState({ ...base, username: "k.sawada" });
    expect(s.status).toBe("not-bootstrap");
    expect(s.canDisable).toBe(false);
    expect(s.message).toBeNull();
  });

  it("refuses to disable while it is the only admin", () => {
    const s = bootstrapAdminState({ ...base, otherActiveAdminCount: 0 });
    expect(s.status).toBe("blocked-no-other-admin");
    expect(s.canDisable).toBe(false);
    expect(s.message).toContain("割り当ててから");
  });

  it("recommends disabling once another admin exists", () => {
    const s = bootstrapAdminState({ ...base, otherActiveAdminCount: 1 });
    expect(s.status).toBe("ready-to-retire");
    expect(s.canDisable).toBe(true);
    expect(s.message).toContain("1 名");
  });

  it("treats an already-disabled account as the desired end state", () => {
    const s = bootstrapAdminState({
      ...base,
      isActive: false,
      otherActiveAdminCount: 3,
    });
    expect(s.status).toBe("retired");
    expect(s.canDisable).toBe(false);
  });

  it("flags the default password only while the account is still usable", () => {
    expect(
      bootstrapAdminState({ ...base, passwordChangeRequired: true })
        .isDefaultPasswordStillActive,
    ).toBe(true);
    // 無効化済みなら既定パスワードでも入れないので、警告は出さない。
    expect(
      bootstrapAdminState({
        ...base,
        isActive: false,
        passwordChangeRequired: true,
      }).isDefaultPasswordStillActive,
    ).toBe(false);
    // パスワードを変えてあれば警告しない。
    expect(
      bootstrapAdminState({ ...base, passwordChangeRequired: false })
        .isDefaultPasswordStillActive,
    ).toBe(false);
  });

  it("keeps the warning independent of whether disabling is allowed", () => {
    // 既定パスワードのまま & 他に管理者が居ない = 最も危ない組み合わせ。
    // 「無効化できない」ことと「危険である」ことは別々に伝える必要がある。
    const s = bootstrapAdminState({
      ...base,
      passwordChangeRequired: true,
      otherActiveAdminCount: 0,
    });
    expect(s.canDisable).toBe(false);
    expect(s.isDefaultPasswordStillActive).toBe(true);
  });
});
