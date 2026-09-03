import { describe, expect, it } from "vitest";
import {
  ALL_CODES,
  buildPermissionSet,
  decide,
  highestScopeRows,
  isSuperuser,
  PERMISSION_SCOPES,
  readableCodes,
  scopeRank,
  visibleAppKeys,
} from "./permission-set";
import type {
  Access,
  PermissionAction,
  PermissionRow,
  PermissionScope,
  PlantRef,
  ScopeContext,
} from "./types";

// ── fixtures ────────────────────────────────────────────────────────────────

const HQ: PlantRef = { id: 1, code: "hq", regionCode: "jp" };
const OSAKA: PlantRef = { id: 2, code: "osaka", regionCode: "jp" };
const SHANGHAI: PlantRef = { id: 3, code: "shanghai", regionCode: "asia" };
const NO_REGION: PlantRef = { id: 4, code: "annex", regionCode: null };

const ALL_PLANTS = [HQ, OSAKA, SHANGHAI, NO_REGION];

function ctx(assigned: PlantRef[]): ScopeContext {
  return { userId: "user-1", assignedPlants: assigned, allPlants: ALL_PLANTS };
}

function row(
  partial: Partial<PermissionRow> & { code: string },
): PermissionRow {
  return {
    action: "READ",
    scope: "ALL",
    scopeValues: ["*"],
    ...partial,
  };
}

function scopedAccess(
  d: ReturnType<typeof decide>,
): Extract<Access, { kind: "SCOPED" }> {
  if (!d.allowed || d.access.kind !== "SCOPED") {
    throw new Error(`expected SCOPED access, got ${JSON.stringify(d)}`);
  }
  return d.access;
}

// ── 基本規則 ────────────────────────────────────────────────────────────────

describe("decide — 基本規則", () => {
  it("空の権限集合は拒否", () => {
    const set = buildPermissionSet([]);
    expect(decide(set, ctx([HQ]), "quote", "READ").allowed).toBe(false);
  });

  it("アクション一致で許可", () => {
    const set = buildPermissionSet([row({ code: "quote", action: "READ" })]);
    expect(decide(set, ctx([]), "quote", "READ").allowed).toBe(true);
    expect(decide(set, ctx([]), "quote", "UPDATE").allowed).toBe(false);
    expect(decide(set, ctx([]), "invoice", "READ").allowed).toBe(false);
  });

  it("コード ADMIN は同一コードの全アクションを内包", () => {
    const set = buildPermissionSet([row({ code: "quote", action: "ADMIN" })]);
    for (const action of [
      "READ",
      "CREATE",
      "UPDATE",
      "DELETE",
      "EXPORT",
      "APPROVE",
    ] as const) {
      expect(decide(set, ctx([]), "quote", action).allowed).toBe(true);
    }
    expect(decide(set, ctx([]), "invoice", "READ").allowed).toBe(false);
  });

  it("system:ADMIN は全コード許可（superuser）+ ALL アクセス", () => {
    const set = buildPermissionSet([row({ code: "system", action: "ADMIN" })]);
    expect(isSuperuser(set)).toBe(true);
    const d = decide(set, ctx([]), "invoice", "DELETE");
    expect(d).toEqual({ allowed: true, access: { kind: "ALL" } });
  });

  it("ALL スコープ行が 1 つでもあれば ALL（他行の制限を無視）", () => {
    const set = buildPermissionSet([
      row({ code: "quote", action: "READ", scope: "OWN" }),
      row({ code: "quote", action: "ADMIN", scope: "ALL" }),
    ]);
    expect(decide(set, ctx([]), "quote", "READ")).toEqual({
      allowed: true,
      access: { kind: "ALL" },
    });
  });
});

// ── PLANT スコープ ──────────────────────────────────────────────────────────

describe("decide — PLANT scope_values", () => {
  it("'*' は所属拠点すべて", () => {
    const set = buildPermissionSet([
      row({ code: "work_order", scope: "PLANT", scopeValues: ["*"] }),
    ]);
    const access = scopedAccess(
      decide(set, ctx([HQ, OSAKA]), "work_order", "READ"),
    );
    expect([...access.plantIds].sort()).toEqual([1, 2]);
    expect(access.own).toBe(false);
  });

  it("拠点コード列挙は所属と交差（未所属の列挙は無効）", () => {
    const set = buildPermissionSet([
      row({
        code: "work_order",
        scope: "PLANT",
        scopeValues: ["hq", "shanghai"],
      }),
    ]);
    // shanghai は未所属 → hq のみ
    const access = scopedAccess(
      decide(set, ctx([HQ, OSAKA]), "work_order", "READ"),
    );
    expect([...access.plantIds]).toEqual([1]);
  });

  it("所属ゼロなら空集合（allowed だが行は見えない — fail-closed）", () => {
    const set = buildPermissionSet([
      row({ code: "work_order", scope: "PLANT", scopeValues: ["*"] }),
    ]);
    const d = decide(set, ctx([]), "work_order", "READ");
    const access = scopedAccess(d);
    expect(access.plantIds.size).toBe(0);
    expect(d.allowed).toBe(true);
  });

  it("空の scope_values（不正データ）は '*' 扱いしない", () => {
    const set = buildPermissionSet([
      row({ code: "work_order", scope: "PLANT", scopeValues: [] }),
    ]);
    const access = scopedAccess(decide(set, ctx([HQ]), "work_order", "READ"));
    expect(access.plantIds.size).toBe(0);
  });
});

// ── REGION スコープ ─────────────────────────────────────────────────────────

describe("decide — REGION scope_values", () => {
  it("'*' は所属拠点の地域の全拠点（未所属の同地域拠点を含む・再交差しない）", () => {
    const set = buildPermissionSet([
      row({ code: "work_order", scope: "REGION", scopeValues: ["*"] }),
    ]);
    // hq 所属 → 地域 jp → jp の全拠点 {hq, osaka}（osaka は未所属でも含む）
    const access = scopedAccess(decide(set, ctx([HQ]), "work_order", "READ"));
    expect([...access.plantIds].sort()).toEqual([1, 2]);
  });

  it("地域コード列挙は所属と無関係にその地域の全拠点", () => {
    const set = buildPermissionSet([
      row({ code: "work_order", scope: "REGION", scopeValues: ["asia"] }),
    ]);
    const access = scopedAccess(decide(set, ctx([HQ]), "work_order", "READ"));
    expect([...access.plantIds]).toEqual([3]);
  });

  it("地域未設定の拠点は REGION では決して一致しない", () => {
    const set = buildPermissionSet([
      row({ code: "work_order", scope: "REGION", scopeValues: ["*"] }),
    ]);
    // annex は regionCode null → 地域なし → 空集合
    const access = scopedAccess(
      decide(set, ctx([NO_REGION]), "work_order", "READ"),
    );
    expect(access.plantIds.size).toBe(0);
  });
});

// ── OWN・合成 ───────────────────────────────────────────────────────────────

describe("decide — OWN と合成", () => {
  it("OWN は own フラグのみ（拠点なし）", () => {
    const set = buildPermissionSet([
      row({ code: "quote", scope: "OWN", scopeValues: ["*"] }),
    ]);
    const access = scopedAccess(decide(set, ctx([HQ]), "quote", "READ"));
    expect(access.own).toBe(true);
    expect(access.plantIds.size).toBe(0);
  });

  it("複数ロールの PLANT grant は和集合", () => {
    const set = buildPermissionSet([
      row({ code: "work_order", scope: "PLANT", scopeValues: ["hq"] }),
      row({ code: "work_order", scope: "PLANT", scopeValues: ["osaka"] }),
    ]);
    const access = scopedAccess(
      decide(set, ctx([HQ, OSAKA]), "work_order", "READ"),
    );
    expect([...access.plantIds].sort()).toEqual([1, 2]);
  });

  it("PLANT + REGION + OWN は全て合成される", () => {
    const set = buildPermissionSet([
      row({ code: "work_order", scope: "PLANT", scopeValues: ["hq"] }),
      row({ code: "work_order", scope: "REGION", scopeValues: ["asia"] }),
      row({ code: "work_order", scope: "OWN" }),
    ]);
    const access = scopedAccess(decide(set, ctx([HQ]), "work_order", "READ"));
    expect([...access.plantIds].sort()).toEqual([1, 3]);
    expect(access.own).toBe(true);
  });

  it("未実装スコープ（COUNTRY 等）は何も与えない（fail-closed）", () => {
    const set = buildPermissionSet([
      row({ code: "work_order", scope: "COUNTRY", scopeValues: ["JP"] }),
    ]);
    const access = scopedAccess(decide(set, ctx([HQ]), "work_order", "READ"));
    expect(access.plantIds.size).toBe(0);
    expect(access.own).toBe(false);
  });

  it("同一 grant 行が重複しても結果は同じ（ビュー多行化に不変）", () => {
    const grant = row({ code: "quote", scope: "OWN" });
    const once = decide(buildPermissionSet([grant]), ctx([]), "quote", "READ");
    const twice = decide(
      buildPermissionSet([grant, grant]),
      ctx([]),
      "quote",
      "READ",
    );
    expect(twice).toEqual(once);
  });
});

// ── readableCodes / visibleAppKeys ──────────────────────────────────────────

describe("readableCodes / visibleAppKeys", () => {
  it("READ か ADMIN を持つコードのみ。superuser は番兵 '*'", () => {
    const set = buildPermissionSet([
      row({ code: "quote", action: "READ" }),
      row({ code: "invoice", action: "UPDATE" }),
      row({ code: "master", action: "ADMIN" }),
    ]);
    const codes = readableCodes(set);
    expect(codes.has("quote")).toBe(true);
    expect(codes.has("master")).toBe(true);
    expect(codes.has("invoice")).toBe(false);
    expect(codes.has(ALL_CODES)).toBe(false);

    const superSet = buildPermissionSet([
      row({ code: "system", action: "ADMIN" }),
    ]);
    expect(readableCodes(superSet).has(ALL_CODES)).toBe(true);
  });

  it("visibleAppKeys — null 権限アプリは常時可視、superuser は全可視", () => {
    const apps = [
      { key: "quotes", requiredPermission: "quote" },
      { key: "invoices", requiredPermission: "invoice" },
      { key: "docs", requiredPermission: null },
    ];
    const set = buildPermissionSet([row({ code: "quote", action: "READ" })]);
    expect(visibleAppKeys(set, apps)).toEqual(new Set(["quotes", "docs"]));

    const superSet = buildPermissionSet([
      row({ code: "system", action: "ADMIN" }),
    ]);
    expect(visibleAppKeys(superSet, apps)).toEqual(
      new Set(["quotes", "invoices", "docs"]),
    );
  });
});

describe("highestScopeRows — 実効権限の表示用に (code, action) を 1 行へ畳む", () => {
  const row = (
    code: string,
    action: PermissionAction,
    scope: PermissionScope,
    scopeValues: string[] = ["*"],
  ): PermissionRow => ({ code, action, scope, scopeValues });

  it("同じ (code, action) はいちばん広い scope だけ残す", () => {
    const out = highestScopeRows([
      row("quote", "READ", "OWN"),
      row("quote", "READ", "ALL"),
      row("quote", "READ", "PLANT"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.scope).toBe("ALL");
  });

  it("action が違えば別の行として残る", () => {
    const out = highestScopeRows([
      row("quote", "READ", "ALL"),
      row("quote", "UPDATE", "OWN"),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.action).sort()).toEqual(["READ", "UPDATE"]);
  });

  it("code が違えば別の行として残る", () => {
    const out = highestScopeRows([
      row("quote", "READ", "ALL"),
      row("invoice", "READ", "OWN"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("同じ広さなら scope_values を足す（片方だけ見せると狭く見えるため）", () => {
    const out = highestScopeRows([
      row("quote", "READ", "PLANT", ["TOKYO"]),
      row("quote", "READ", "PLANT", ["OSAKA"]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.scopeValues).toEqual(["OSAKA", "TOKYO"]);
  });

  it("'*' は列挙を吸収する", () => {
    const out = highestScopeRows([
      row("quote", "READ", "PLANT", ["TOKYO"]),
      row("quote", "READ", "PLANT", ["*"]),
    ]);
    expect(out[0]?.scopeValues).toEqual(["*"]);
  });

  it("狭いほうの scope_values は持ち上げない（別の広さの行は落とす）", () => {
    const out = highestScopeRows([
      row("quote", "READ", "REGION", ["EU"]),
      row("quote", "READ", "PLANT", ["TOKYO"]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.scope).toBe("REGION");
    expect(out[0]?.scopeValues).toEqual(["EU"]);
  });

  it("入力を書き換えない", () => {
    const input = [row("quote", "READ", "PLANT", ["TOKYO"])];
    highestScopeRows([...input, row("quote", "READ", "PLANT", ["OSAKA"])]);
    expect(input[0]?.scopeValues).toEqual(["TOKYO"]);
  });

  it("空を渡せば空", () => {
    expect(highestScopeRows([])).toEqual([]);
  });
});

describe("scopeRank", () => {
  it("ALL がいちばん広い（0）", () => {
    expect(scopeRank("ALL")).toBe(0);
  });
  it("PERMISSION_SCOPES の並びどおりに広い→狭い", () => {
    const ranks = PERMISSION_SCOPES.map(scopeRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
  it("未知の値は最も狭い扱い（fail-closed）", () => {
    expect(scopeRank("NOPE" as PermissionScope)).toBeGreaterThanOrEqual(
      PERMISSION_SCOPES.length,
    );
  });
});
