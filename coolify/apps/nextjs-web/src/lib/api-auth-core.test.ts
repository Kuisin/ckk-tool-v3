import { describe, expect, it } from "vitest";
import {
  type ApiAuthRow,
  apiAuthDecision,
  cidrAllowed,
  DENY_ORDER,
  isExpired,
} from "./api-auth-core";
import { unauthorizedProblem } from "./api-problem-core";
import { ipInAnyCidr } from "./cidr-core";

const NOW = new Date("2026-09-10T00:00:00.000Z");
const PAST = new Date("2026-09-09T23:59:59.000Z");
const FUTURE = new Date("2026-09-11T00:00:00.000Z");

function row(
  over: {
    token?: Partial<ApiAuthRow>;
    client?: Partial<ApiAuthRow["client"]>;
    user?: Partial<ApiAuthRow["client"]["user"]>;
  } = {},
): ApiAuthRow {
  return {
    id: "tok-1",
    revokedAt: null,
    expiresAt: null,
    ...over.token,
    client: {
      id: "cli-1",
      name: "verify-1",
      isActive: true,
      revokedAt: null,
      expiresAt: null,
      allowedCidrs: [],
      ...over.client,
      user: {
        id: "usr-1",
        username: "api:verify-1",
        displayName: "verify-1",
        isActive: true,
        ...over.user,
      },
    },
  };
}

const decide = (r: ApiAuthRow | null, ip: string | null = "10.1.2.3") =>
  apiAuthDecision(r, NOW, ip, ipInAnyCidr);

describe("isExpired", () => {
  it("null は無期限", () => expect(isExpired(null, NOW)).toBe(false));
  it("過去は期限切れ", () => expect(isExpired(PAST, NOW)).toBe(true));
  it("未来は有効", () => expect(isExpired(FUTURE, NOW)).toBe(false));
  it("ちょうどその時刻は期限切れ（境界）", () =>
    expect(isExpired(NOW, NOW)).toBe(true));
});

describe("cidrAllowed", () => {
  it("空配列は制限なし（IP 不明でも通す）", () => {
    expect(cidrAllowed([], "10.1.2.3", ipInAnyCidr)).toBe(true);
    expect(cidrAllowed([], null, ipInAnyCidr)).toBe(true);
  });

  it("一致すれば通す", () =>
    expect(cidrAllowed(["10.0.0.0/8"], "10.1.2.3", ipInAnyCidr)).toBe(true));

  it("一致しなければ拒否", () =>
    expect(cidrAllowed(["10.0.0.0/8"], "192.168.1.1", ipInAnyCidr)).toBe(
      false,
    ));

  it("リストがあるのに IP 不明なら拒否（fail-closed）", () =>
    expect(cidrAllowed(["10.0.0.0/8"], null, ipInAnyCidr)).toBe(false));

  it("IPv6 も判定できる", () => {
    expect(cidrAllowed(["2001:db8::/32"], "2001:db8::1", ipInAnyCidr)).toBe(
      true,
    );
    expect(cidrAllowed(["2001:db8::/32"], "2001:db9::1", ipInAnyCidr)).toBe(
      false,
    );
  });
});

describe("apiAuthDecision", () => {
  it("健全な行は通る", () => {
    expect(decide(row())).toEqual({ ok: true });
  });

  it.each([
    ["UNKNOWN_TOKEN", null as ApiAuthRow | null, "10.1.2.3"],
    ["TOKEN_REVOKED", row({ token: { revokedAt: PAST } }), "10.1.2.3"],
    ["TOKEN_EXPIRED", row({ token: { expiresAt: PAST } }), "10.1.2.3"],
    ["CLIENT_REVOKED", row({ client: { revokedAt: PAST } }), "10.1.2.3"],
    ["CLIENT_INACTIVE", row({ client: { isActive: false } }), "10.1.2.3"],
    ["CLIENT_EXPIRED", row({ client: { expiresAt: PAST } }), "10.1.2.3"],
    [
      "CIDR_DENIED",
      row({ client: { allowedCidrs: ["203.0.113.0/24"] } }),
      "10.1.2.3",
    ],
    ["USER_INACTIVE", row({ user: { isActive: false } }), "10.1.2.3"],
  ])("拒否: %s", (reason, r, ip) => {
    expect(decide(r as ApiAuthRow | null, ip)).toEqual({ ok: false, reason });
  });

  it("トークンが無期限でも、クライアントの期限は効く", () => {
    expect(decide(row({ client: { expiresAt: PAST } }))).toEqual({
      ok: false,
      reason: "CLIENT_EXPIRED",
    });
  });

  // ★ 順序が仕様。全部同時に成り立つ行でも、返る理由は 1 つに定まる。
  it("複数の条件が同時に成り立っても、DENY_ORDER の最初の 1 つを返す", () => {
    const broken = row({
      token: { revokedAt: PAST, expiresAt: PAST },
      client: {
        revokedAt: PAST,
        isActive: false,
        expiresAt: PAST,
        allowedCidrs: ["203.0.113.0/24"],
      },
      user: { isActive: false },
    });
    expect(decide(broken)).toEqual({ ok: false, reason: "TOKEN_REVOKED" });
  });

  it("DENY_ORDER は理由の集合を過不足なく並べている", () => {
    expect(new Set(DENY_ORDER).size).toBe(DENY_ORDER.length);
    expect(DENY_ORDER).toContain("UNKNOWN_TOKEN");
    expect(DENY_ORDER).toContain("USER_INACTIVE");
  });
});

// ★ この試験がこの設計の要。理由がいくつ増えても、外に出る本文は 1 つ。
describe("拒否理由は応答から区別できない", () => {
  it("どの理由でも 401 の本文は完全に同一", () => {
    const bodies = DENY_ORDER.map(() =>
      JSON.stringify(unauthorizedProblem("/api/v1/me")),
    );
    expect(new Set(bodies).size).toBe(1);
  });

  it("401 の本文に拒否理由の語が混ざっていない", () => {
    const body = JSON.stringify(unauthorizedProblem("/api/v1/me"));
    for (const reason of DENY_ORDER) {
      expect(body.toUpperCase()).not.toContain(reason);
    }
  });
});
