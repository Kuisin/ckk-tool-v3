import { describe, expect, it } from "vitest";
import {
  hostnameOf,
  matchBlacklist,
  normalizeBlacklistPattern,
  normalizeUrl,
} from "./link-index-core";

describe("normalizeUrl", () => {
  // 不変条件: 同じ遷移先は同じ文字列になる（索引を 1 コードに寄せる鍵）。
  it("lowercases the host and drops default ports", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/a")).toBe(
      "https://example.com/a",
    );
    expect(normalizeUrl("http://Example.com:80/a")).toBe(
      "http://example.com/a",
    );
  });

  it("keeps a non-default port and a meaningful fragment", () => {
    expect(normalizeUrl("https://example.com:8443/a")).toBe(
      "https://example.com:8443/a",
    );
    expect(normalizeUrl("https://example.com/a#section")).toBe(
      "https://example.com/a#section",
    );
  });

  it("drops an empty trailing fragment", () => {
    expect(normalizeUrl("https://example.com/a#")).toBe(
      "https://example.com/a",
    );
  });

  // 不変条件: クエリは遷移先を変えるので保持する。
  it("preserves the query string", () => {
    expect(normalizeUrl("https://example.com/a?b=1&c=2")).toBe(
      "https://example.com/a?b=1&c=2",
    );
  });

  it("rejects non-http(s) and malformed input", () => {
    for (const bad of [
      "mailto:a@example.com",
      "javascript:alert(1)",
      "data:text/html,x",
      "/relative",
      "not a url",
      "",
    ]) {
      expect(normalizeUrl(bad), bad).toBeNull();
    }
  });
});

describe("hostnameOf", () => {
  it("extracts a lowercase hostname", () => {
    expect(hostnameOf("https://Sub.Example.COM/a")).toBe("sub.example.com");
  });

  it("returns null for malformed input", () => {
    expect(hostnameOf("nope")).toBeNull();
  });
});

describe("normalizeBlacklistPattern", () => {
  it("accepts a bare hostname and strips wildcard prefixes", () => {
    expect(normalizeBlacklistPattern("evil.example")).toBe("evil.example");
    expect(normalizeBlacklistPattern("*.evil.example")).toBe("evil.example");
    expect(normalizeBlacklistPattern(".evil.example")).toBe("evil.example");
    expect(normalizeBlacklistPattern("  EVIL.Example  ")).toBe("evil.example");
  });

  it("extracts the hostname when a full URL is pasted", () => {
    expect(normalizeBlacklistPattern("https://Evil.example/path?a=1")).toBe(
      "evil.example",
    );
  });

  it("rejects values that are not hostnames", () => {
    for (const bad of ["", "   ", "evil example", "evil/example", "@@@"]) {
      expect(normalizeBlacklistPattern(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("matchBlacklist", () => {
  // 不変条件: サフィックス一致はラベル境界でのみ成立する。
  // 部分文字列一致にすると notevil.example まで巻き添えで落ちる。
  it("matches the host itself and its subdomains only", () => {
    const patterns = ["evil.example"];
    expect(matchBlacklist("evil.example", patterns)).toBe("evil.example");
    expect(matchBlacklist("sub.evil.example", patterns)).toBe("evil.example");
    expect(matchBlacklist("a.b.evil.example", patterns)).toBe("evil.example");
  });

  it("does not match a host that merely ends with the same letters", () => {
    const patterns = ["evil.example"];
    expect(matchBlacklist("notevil.example", patterns)).toBeNull();
    expect(matchBlacklist("evil.example.org", patterns)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(matchBlacklist("SUB.Evil.Example", ["evil.example"])).toBe(
      "evil.example",
    );
  });

  it("handles an empty pattern list and blank patterns", () => {
    expect(matchBlacklist("example.com", [])).toBeNull();
    expect(matchBlacklist("example.com", [""])).toBeNull();
  });
});
