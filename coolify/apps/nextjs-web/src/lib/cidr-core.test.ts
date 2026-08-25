/**
 * cidr-core.test.ts — 「社内ネットワークか」の判定と、信頼できるクライアント IP
 * 取り出しの不変条件。
 *
 * ここが守るもの:
 *  - IPv4-mapped IPv6（::ffff:a.b.c.d）が IPv4 の CIDR に**マッチする**こと。
 *    デュアルスタック待ち受けの Node が返す形なので、ここが壊れると社内端末が
 *    まるごと「社外」判定になる。
 *  - 曖昧・不正な表記を**受け付けない**こと（先頭ゼロ = 8進誤読）。
 *  - x-forwarded-for の**左端を絶対に採らない**こと。左端はクライアントが
 *    自由に書ける値で、ここを信じると所有区分判定ごと偽装できる。
 *  - どんな壊れた入力でも例外を投げないこと（ヘッダ由来の値を扱うため）。
 */

import { describe, expect, it } from "vitest";
import {
  clientIpFromForwardedFor,
  ipInAnyCidr,
  ipInCidr,
  normalizeIp,
  parseCidr,
  parseCidrList,
  parseIp,
} from "./cidr-core";

describe("parseIp / normalizeIp", () => {
  it("IPv4 を解析する", () => {
    expect(parseIp("192.168.50.7")?.version).toBe(4);
    expect(normalizeIp("192.168.50.7")).toBe("192.168.50.7");
  });

  it("IPv6 を圧縮した正規形にする", () => {
    expect(normalizeIp("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:db8::1",
    );
    expect(normalizeIp("::1")).toBe("::1");
    expect(normalizeIp("::")).toBe("::");
  });

  it("IPv4-mapped IPv6 はドット表記へ畳む", () => {
    expect(normalizeIp("::ffff:192.168.50.7")).toBe("192.168.50.7");
    expect(normalizeIp("::ffff:c0a8:3207")).toBe("192.168.50.7");
  });

  it("角括弧・ゾーンID・末尾ポートを剥がす", () => {
    expect(normalizeIp("[2001:db8::1]")).toBe("2001:db8::1");
    expect(normalizeIp("[::1]:443")).toBe("::1");
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
    expect(normalizeIp("192.168.1.1:443")).toBe("192.168.1.1");
    expect(normalizeIp("  10.0.0.1  ")).toBe("10.0.0.1");
  });

  it("末尾埋め込み IPv4 を含む IPv6 を解析する", () => {
    // 正規形は 16 進表記に寄せる（v4-compatible 表記は非推奨で曖昧なため）。
    // mapped（::ffff:…）だけがドット表記へ畳まれる。
    expect(normalizeIp("0:0:0:0:0:0:192.168.0.1")).toBe("::c0a8:1");
    expect(parseIp("0:0:0:0:0:0:192.168.0.1")?.version).toBe(6);
  });

  it("不正・曖昧な表記は null（例外を投げない）", () => {
    for (const bad of [
      "999.1.1.1",
      "010.0.0.1", // 先頭ゼロ = 8進誤読のもと
      "1.2.3",
      "1.2.3.4.5",
      "::::",
      "1::2::3",
      "12345::1",
      "",
      "   ",
      "not-an-ip",
      "[2001:db8::1", // 閉じ括弧なし
      null,
      undefined,
      42,
      {},
    ]) {
      expect(normalizeIp(bad as unknown)).toBeNull();
      expect(parseIp(bad as unknown)).toBeNull();
    }
  });
});

describe("parseCidr", () => {
  it("プレフィクス無しはホストルート", () => {
    expect(parseCidr("10.0.0.1")?.prefix).toBe(32);
    expect(parseCidr("::1")?.prefix).toBe(128);
  });

  it("範囲外のプレフィクスは拒否", () => {
    expect(parseCidr("10.0.0.0/33")).toBeNull();
    expect(parseCidr("::/129")).toBeNull();
    expect(parseCidr("10.0.0.0/x")).toBeNull();
    expect(parseCidr("10.0.0.0/")).toBeNull();
  });

  it("IPv4-mapped の CIDR は v4 として扱う", () => {
    const parsed = parseCidr("::ffff:10.0.0.0/8");
    expect(parsed?.version).toBe(4);
  });
});

describe("ipInCidr", () => {
  it("境界を正しく扱う", () => {
    expect(ipInCidr("10.255.255.255", "10.0.0.0/8")).toBe(true);
    expect(ipInCidr("11.0.0.0", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("192.168.50.255", "192.168.50.0/24")).toBe(true);
    expect(ipInCidr("192.168.51.0", "192.168.50.0/24")).toBe(false);
  });

  it("端数プレフィクスをバイトマスクで扱う", () => {
    expect(ipInCidr("172.31.255.255", "172.16.0.0/12")).toBe(true);
    expect(ipInCidr("172.32.0.0", "172.16.0.0/12")).toBe(false);
    expect(ipInCidr("10.0.1.255", "10.0.0.0/23")).toBe(true);
    expect(ipInCidr("10.0.2.0", "10.0.0.0/23")).toBe(false);
    expect(ipInCidr("10.0.0.1", "10.0.0.0/31")).toBe(true);
    expect(ipInCidr("10.0.0.2", "10.0.0.0/31")).toBe(false);
  });

  it("/0 は同族全マッチ・異族ノーマッチ", () => {
    expect(ipInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
    expect(ipInCidr("2001:db8::1", "0.0.0.0/0")).toBe(false);
    expect(ipInCidr("2001:db8::1", "::/0")).toBe(true);
    expect(ipInCidr("8.8.8.8", "::/0")).toBe(false);
  });

  it("IPv4-mapped IPv6 が IPv4 の CIDR にマッチする（最重要）", () => {
    expect(ipInCidr("::ffff:192.168.50.7", "192.168.50.0/24")).toBe(true);
    expect(ipInCidr("::ffff:192.168.51.7", "192.168.50.0/24")).toBe(false);
  });

  it("IPv6 の CIDR", () => {
    expect(ipInCidr("2001:db8::1", "2001:db8::/32")).toBe(true);
    expect(ipInCidr("2001:db9::1", "2001:db8::/32")).toBe(false);
    expect(ipInCidr("::1", "::1/128")).toBe(true);
  });

  it("不正入力は false", () => {
    expect(ipInCidr("bogus", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("10.0.0.1", "bogus")).toBe(false);
    expect(ipInCidr(null, null)).toBe(false);
  });
});

describe("ipInAnyCidr / parseCidrList", () => {
  it("いずれかに入れば true", () => {
    const list = ["10.0.0.0/8", "192.168.50.0/24"];
    expect(ipInAnyCidr("192.168.50.9", list)).toBe(true);
    expect(ipInAnyCidr("172.16.0.1", list)).toBe(false);
    expect(ipInAnyCidr("10.0.0.1", [])).toBe(false);
  });

  it("env 文字列から不正要素を落として読む", () => {
    expect(parseCidrList("10.0.0.0/8, bogus,\n192.168.0.0/16")).toEqual([
      "10.0.0.0/8",
      "192.168.0.0/16",
    ]);
    expect(parseCidrList("")).toEqual([]);
    expect(parseCidrList(undefined)).toEqual([]);
  });
});

describe("clientIpFromForwardedFor", () => {
  const chain = "1.2.3.4, 10.0.0.1, 10.0.0.2";

  it("既定（hops=0）は右端 — 最も近いプロキシが観測した値", () => {
    expect(clientIpFromForwardedFor(chain, 0)).toBe("10.0.0.2");
  });

  it("hops 分だけ右から遡る", () => {
    expect(clientIpFromForwardedFor(chain, 1)).toBe("10.0.0.1");
    expect(clientIpFromForwardedFor(chain, 2)).toBe("1.2.3.4");
  });

  it("要素数を超える hops は左端で頭打ち", () => {
    expect(clientIpFromForwardedFor(chain, 99)).toBe("1.2.3.4");
  });

  it("クライアントが自称した左端を既定で採らない", () => {
    // 攻撃者が "203.0.113.9" を自称しても、hops=0 なら採用されない
    const spoofed = "203.0.113.9, 198.51.100.1";
    expect(clientIpFromForwardedFor(spoofed, 0)).toBe("198.51.100.1");
    expect(clientIpFromForwardedFor(spoofed, 0)).not.toBe("203.0.113.9");
  });

  it("値を正規形にして返す", () => {
    expect(clientIpFromForwardedFor("::ffff:192.168.50.7", 0)).toBe(
      "192.168.50.7",
    );
  });

  it("空・不正は null", () => {
    expect(clientIpFromForwardedFor(null, 0)).toBeNull();
    expect(clientIpFromForwardedFor("", 0)).toBeNull();
    expect(clientIpFromForwardedFor("   ", 0)).toBeNull();
    expect(clientIpFromForwardedFor("bogus", 0)).toBeNull();
    expect(clientIpFromForwardedFor(chain, Number.NaN)).toBe("10.0.0.2");
    expect(clientIpFromForwardedFor(chain, -5)).toBe("10.0.0.2");
  });
});
