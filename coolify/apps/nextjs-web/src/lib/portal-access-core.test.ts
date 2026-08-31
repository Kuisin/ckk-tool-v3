import { describe, expect, it } from "vitest";
import {
  isPortalResourceType,
  type PortalGrantRow,
  type PortalSubject,
  type PortalTarget,
  portalScopeBpIds,
  resolvePortalAccess,
} from "./portal-access-core";

const NOW = new Date("2026-09-01T00:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);

const ACTIVE: PortalSubject = { accountId: "acc-1", isActive: true };
const INACTIVE: PortalSubject = { accountId: "acc-1", isActive: false };

const BP_A = "bp-a";
const BP_A_BRANCH = "bp-a-branch";
const BP_B = "bp-b";

const invoiceForA: PortalTarget = {
  type: "invoices",
  id: "INV-202609-00001",
  customerBpIds: [BP_A],
  endUserBpIds: [],
};
const invoiceForB: PortalTarget = {
  type: "invoices",
  id: "INV-202609-00002",
  customerBpIds: [BP_B],
  endUserBpIds: [],
};

const bpScope = (over: Partial<PortalGrantRow> = {}): PortalGrantRow => ({
  kind: "BP_SCOPE",
  bpIds: [BP_A, BP_A_BRANCH],
  includeAsEndUser: false,
  expiresAt: null,
  revokedAt: null,
  ...over,
});

describe("resolvePortalAccess — 主体", () => {
  it("無効なアカウントは、付与があっても全拒否", () => {
    const r = resolvePortalAccess(NOW, [bpScope()], INACTIVE, invoiceForA);
    expect(r.canView).toBe(false);
    expect(r.reason).toBe("INACTIVE");
  });

  it("付与が 1 件も無ければ拒否", () => {
    const r = resolvePortalAccess(NOW, [], ACTIVE, invoiceForA);
    expect(r.canView).toBe(false);
    expect(r.reason).toBe("NO_GRANT");
  });
});

describe("resolvePortalAccess — BP_SCOPE", () => {
  it("自社宛の書類は見える", () => {
    expect(
      resolvePortalAccess(NOW, [bpScope()], ACTIVE, invoiceForA).canView,
    ).toBe(true);
  });

  it("他社宛の書類は見えない", () => {
    const r = resolvePortalAccess(NOW, [bpScope()], ACTIVE, invoiceForB);
    expect(r.canView).toBe(false);
    expect(r.reason).toBe("OUT_OF_SCOPE");
  });

  it("支店宛の書類も、支店が集合に入っていれば見える", () => {
    const branchInvoice: PortalTarget = {
      ...invoiceForA,
      customerBpIds: [BP_A_BRANCH],
    };
    expect(
      resolvePortalAccess(NOW, [bpScope()], ACTIVE, branchInvoice).canView,
    ).toBe(true);
  });

  it("**支店だけのアカウントは親会社の書類を見られない**（上へ辿らない）", () => {
    const branchOnly = bpScope({ bpIds: [BP_A_BRANCH] });
    const parentInvoice: PortalTarget = {
      ...invoiceForA,
      customerBpIds: [BP_A],
    };
    expect(
      resolvePortalAccess(NOW, [branchOnly], ACTIVE, parentInvoice).canView,
    ).toBe(false);
  });

  it("失効した付与はマッチしない", () => {
    const r = resolvePortalAccess(
      NOW,
      [bpScope({ revokedAt: at(-1) })],
      ACTIVE,
      invoiceForA,
    );
    expect(r.canView).toBe(false);
    expect(r.reason).toBe("GRANT_EXPIRED");
  });

  it("期限切れの付与はマッチしない", () => {
    const r = resolvePortalAccess(
      NOW,
      [bpScope({ expiresAt: NOW })],
      ACTIVE,
      invoiceForA,
    );
    expect(r.canView).toBe(false);
    expect(r.reason).toBe("GRANT_EXPIRED");
  });

  it("期限が未来なら有効", () => {
    expect(
      resolvePortalAccess(
        NOW,
        [bpScope({ expiresAt: at(1) })],
        ACTIVE,
        invoiceForA,
      ).canView,
    ).toBe(true);
  });
});

describe("resolvePortalAccess — 需要家（includeAsEndUser）", () => {
  const asEndUser: PortalTarget = {
    type: "order_acceptances",
    id: "ORD-202609-00001",
    customerBpIds: [BP_B], // 顧客は別会社
    endUserBpIds: [BP_A], // 自社は需要家として載っているだけ
  };

  it("既定（false）では、需要家としての一致では見えない", () => {
    expect(
      resolvePortalAccess(NOW, [bpScope()], ACTIVE, asEndUser).canView,
    ).toBe(false);
  });

  it("includeAsEndUser を立てた付与でだけ見える", () => {
    expect(
      resolvePortalAccess(
        NOW,
        [bpScope({ includeAsEndUser: true })],
        ACTIVE,
        asEndUser,
      ).canView,
    ).toBe(true);
  });
});

describe("resolvePortalAccess — DOCUMENT", () => {
  const docGrant: PortalGrantRow = {
    kind: "DOCUMENT",
    resourceType: "invoices",
    resourceId: "INV-202609-00002",
    expiresAt: null,
    revokedAt: null,
  };

  it("**BP 一致を要求しない**（指定された 1 件だけ、の意味）", () => {
    expect(
      resolvePortalAccess(NOW, [docGrant], ACTIVE, invoiceForB).canView,
    ).toBe(true);
  });

  it("別の書類には効かない", () => {
    expect(
      resolvePortalAccess(NOW, [docGrant], ACTIVE, invoiceForA).canView,
    ).toBe(false);
  });

  it("種別が違えば効かない（id が同じでも）", () => {
    const sameIdOtherType: PortalTarget = {
      type: "quotes",
      id: "INV-202609-00002",
      customerBpIds: [],
    };
    expect(
      resolvePortalAccess(NOW, [docGrant], ACTIVE, sameIdOtherType).canView,
    ).toBe(false);
  });
});

describe("resolvePortalAccess — FORM と絞り込み", () => {
  const form: PortalTarget = { type: "forms", id: "F-001" };

  it("条件なしの FORM は全件見える", () => {
    const r = resolvePortalAccess(
      NOW,
      [{ kind: "FORM", resourceId: "F-001" }],
      ACTIVE,
      form,
    );
    expect(r.canView).toBe(true);
    expect(r.responseScope.all).toBe(true);
  });

  it("条件つきは条件を積む", () => {
    const r = resolvePortalAccess(
      NOW,
      [
        {
          kind: "FORM",
          resourceId: "F-001",
          condition: { fieldKey: "plant", values: ["F01"] },
        },
      ],
      ACTIVE,
      form,
    );
    expect(r.canView).toBe(true);
    expect(r.responseScope.all).toBe(false);
    expect(r.responseScope.conditions).toHaveLength(1);
  });

  it("条件なしの行が 1 つでもあれば全件（範囲は広がるだけ・狭まらない）", () => {
    const r = resolvePortalAccess(
      NOW,
      [
        {
          kind: "FORM",
          resourceId: "F-001",
          condition: { fieldKey: "plant", values: ["F01"] },
        },
        { kind: "FORM", resourceId: "F-001" },
      ],
      ACTIVE,
      form,
    );
    expect(r.responseScope.all).toBe(true);
  });

  it("BP_SCOPE はフォームを出さない（BP で宛て先が決まらないため）", () => {
    expect(resolvePortalAccess(NOW, [bpScope()], ACTIVE, form).canView).toBe(
      false,
    );
  });
});

describe("resolvePortalAccess — fail-closed", () => {
  it("未知の kind は権限を与えない", () => {
    const r = resolvePortalAccess(
      NOW,
      [{ kind: "EVERYTHING" } as PortalGrantRow],
      ACTIVE,
      invoiceForA,
    );
    expect(r.canView).toBe(false);
    expect(r.reason).toBe("UNKNOWN_KIND");
  });

  it("未知の kind が混ざっていても、既知の行の判断は変わらない", () => {
    expect(
      resolvePortalAccess(
        NOW,
        [{ kind: "EVERYTHING" } as PortalGrantRow, bpScope()],
        ACTIVE,
        invoiceForA,
      ).canView,
    ).toBe(true);
  });

  it("bpIds が空の BP_SCOPE は何も許可しない", () => {
    expect(
      resolvePortalAccess(NOW, [bpScope({ bpIds: [] })], ACTIVE, invoiceForA)
        .canView,
    ).toBe(false);
  });

  it("対象に BP が無い書類は BP_SCOPE で見えない", () => {
    const orphan: PortalTarget = { type: "invoices", id: "INV-X" };
    expect(resolvePortalAccess(NOW, [bpScope()], ACTIVE, orphan).canView).toBe(
      false,
    );
  });
});

describe("portalScopeBpIds", () => {
  it("無効なアカウントは空", () => {
    const s = portalScopeBpIds(NOW, [bpScope()], INACTIVE);
    expect(s.customerBpIds).toEqual([]);
    expect(s.endUserBpIds).toEqual([]);
    expect(s.documentIds.size).toBe(0);
  });

  it("BP_SCOPE を集める", () => {
    const s = portalScopeBpIds(NOW, [bpScope()], ACTIVE);
    expect(s.customerBpIds.sort()).toEqual([BP_A, BP_A_BRANCH].sort());
    expect(s.endUserBpIds).toEqual([]);
  });

  it("includeAsEndUser のときだけ需要家側にも入る", () => {
    const s = portalScopeBpIds(
      NOW,
      [bpScope({ includeAsEndUser: true })],
      ACTIVE,
    );
    expect(s.endUserBpIds.sort()).toEqual([BP_A, BP_A_BRANCH].sort());
  });

  it("失効・期限切れの付与は集めない", () => {
    const s = portalScopeBpIds(
      NOW,
      [bpScope({ revokedAt: NOW }), bpScope({ expiresAt: NOW })],
      ACTIVE,
    );
    expect(s.customerBpIds).toEqual([]);
  });

  it("DOCUMENT / FORM は種別ごとに束ねる", () => {
    const s = portalScopeBpIds(
      NOW,
      [
        { kind: "DOCUMENT", resourceType: "invoices", resourceId: "INV-1" },
        { kind: "DOCUMENT", resourceType: "invoices", resourceId: "INV-2" },
        { kind: "DOCUMENT", resourceType: "quotes", resourceId: "QOT-1" },
        { kind: "FORM", resourceId: "F-001" },
      ],
      ACTIVE,
    );
    expect([...(s.documentIds.get("invoices") ?? [])].sort()).toEqual([
      "INV-1",
      "INV-2",
    ]);
    expect([...(s.documentIds.get("quotes") ?? [])]).toEqual(["QOT-1"]);
    expect([...(s.documentIds.get("forms") ?? [])]).toEqual(["F-001"]);
  });

  it("未知の resourceType は集めない", () => {
    const s = portalScopeBpIds(
      NOW,
      [{ kind: "DOCUMENT", resourceType: "work_orders", resourceId: "1" }],
      ACTIVE,
    );
    expect(s.documentIds.size).toBe(0);
  });
});

describe("isPortalResourceType", () => {
  it("指示書・出荷書は社外向けの種別に含まれない", () => {
    expect(isPortalResourceType("work_orders")).toBe(false);
    expect(isPortalResourceType("delivery_orders")).toBe(false);
  });
  it("書類 4 種と注文明細・フォームは含まれる", () => {
    for (const t of [
      "quotes",
      "order_acceptances",
      "delivery_notes",
      "invoices",
      "order_lines",
      "forms",
    ]) {
      expect(isPortalResourceType(t), t).toBe(true);
    }
  });
});
