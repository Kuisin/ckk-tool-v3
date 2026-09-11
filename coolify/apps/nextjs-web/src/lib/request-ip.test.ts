/**
 * request-ip.test.ts — 送信元 IP の取り出し。
 *
 * ここが守るもの:
 *  - `clientIpOf` は **XFF の左端を採らない**（cidr-core.test.ts と同じ不変条件を
 *    env を通した実配線でも確かめる）。
 *  - `rateLimitIpOf` は **cf-connecting-ip を優先する**。これが無いと、社外の
 *    利用者は全員が同じプロキシ住所に潰れ、1 人の打ち間違い 30 回で全員が
 *    ログインできなくなる（実際にその設定で動いていた）。
 *  - ただし **記録用の値は変えない** — `clientIpOf` は cf-connecting-ip を見ない。
 */

import { afterEach, describe, expect, it } from "vitest";
import { clientIpOf, forwardedChainOf, rateLimitIpOf } from "./request-ip";

function req(headers: Record<string, string>): Request {
  return new Request("https://app.example/api", { headers });
}

const ORIGINAL_HOPS = process.env.TRUSTED_PROXY_HOPS;

afterEach(() => {
  if (ORIGINAL_HOPS === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = ORIGINAL_HOPS;
});

describe("clientIpOf", () => {
  it("TRUSTED_PROXY_HOPS 未設定なら XFF の右端（手前のプロキシ）を採る", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(
      clientIpOf(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" })),
    ).toBe("10.0.0.2");
  });

  it("段数を指定すると、その数だけ左へ遡る", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(
      clientIpOf(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" })),
    ).toBe("203.0.113.9");
  });

  it("XFF が無ければ x-real-ip に落ちる", () => {
    expect(clientIpOf(req({ "x-real-ip": "198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
    expect(clientIpOf(req({}))).toBeNull();
  });

  it("cf-connecting-ip は**見ない**（記録する住所は偽装できる値にしない）", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(
      clientIpOf(
        req({
          "cf-connecting-ip": "203.0.113.9",
          "x-forwarded-for": "10.0.0.1, 10.0.0.2",
        }),
      ),
    ).toBe("10.0.0.2");
  });
});

describe("rateLimitIpOf", () => {
  it("cf-connecting-ip があればそれを使う（社外の利用者を 1 つに潰さない）", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    const a = rateLimitIpOf(
      req({
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2",
      }),
    );
    const b = rateLimitIpOf(
      req({
        "cf-connecting-ip": "198.51.100.7",
        "x-forwarded-for": "198.51.100.7, 10.0.0.1, 10.0.0.2",
      }),
    );
    // 同じプロキシを通っても、別の利用者は別のバケットになる。
    expect(a).toBe("203.0.113.9");
    expect(b).toBe("198.51.100.7");
    expect(a).not.toBe(b);
  });

  it("IPv4-mapped IPv6 も正規形に落ちる（バケットが割れない）", () => {
    expect(
      rateLimitIpOf(req({ "cf-connecting-ip": "::ffff:203.0.113.9" })),
    ).toBe("203.0.113.9");
  });

  it("cf-connecting-ip が無い / 壊れているときは clientIpOf に落ちる", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(
      rateLimitIpOf(req({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" })),
    ).toBe("10.0.0.2");
    expect(
      rateLimitIpOf(
        req({ "cf-connecting-ip": "not-an-ip", "x-real-ip": "198.51.100.7" }),
      ),
    ).toBe("198.51.100.7");
  });

  it("材料が何も無ければ null（IP バケットは使わない）", () => {
    expect(rateLimitIpOf(req({}))).toBeNull();
  });
});

describe("forwardedChainOf", () => {
  it("生チェーンをそのまま残す（段数の検算用）", () => {
    expect(
      forwardedChainOf(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })),
    ).toBe("203.0.113.9, 10.0.0.1");
    expect(forwardedChainOf(req({}))).toBeNull();
  });
});
