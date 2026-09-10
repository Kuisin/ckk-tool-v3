import { describe, expect, it } from "vitest";
import {
  decideConcurrency,
  decideIdempotency,
  etagOf,
  isValidIdempotencyKey,
  parseIfMatch,
  requestFingerprint,
} from "./api-write-core";

const NOW = new Date("2026-09-10T00:00:00.000Z");
const OTHER = new Date("2026-09-10T00:00:01.000Z");

describe("isValidIdempotencyKey", () => {
  it("普通の鍵は通る", () => {
    expect(isValidIdempotencyKey("order-2026-09-10-0001")).toBe(true);
    expect(isValidIdempotencyKey(crypto.randomUUID())).toBe(true);
  });
  it.each([
    ["null", null],
    ["空", ""],
    ["短すぎる", "abc"],
    ["長すぎる", "x".repeat(256)],
    ["制御文字", "abc\ndef12345"],
    ["日本語（非 ASCII）", "注文キー12345"],
  ])("弾く: %s", (_l, v) => expect(isValidIdempotencyKey(v)).toBe(false));
});

describe("requestFingerprint", () => {
  it("同じ要求は同じ指紋", () => {
    expect(requestFingerprint("POST", "/x", "{}")).toBe(
      requestFingerprint("post", "/x", "{}"),
    );
  });
  it("本文が違えば違う", () => {
    expect(requestFingerprint("POST", "/x", "{}")).not.toBe(
      requestFingerprint("POST", "/x", '{"a":1}'),
    );
  });
  // 同じ鍵を別の口へ使い回した再送を弾くため、パスも混ぜる。
  it("パスが違えば違う", () => {
    expect(requestFingerprint("POST", "/a", "{}")).not.toBe(
      requestFingerprint("POST", "/b", "{}"),
    );
  });
});

describe("decideIdempotency", () => {
  const stored = {
    requestHash: requestFingerprint("POST", "/x", "{}"),
    responseStatus: 201,
    responseBody: '{"number":"ORD-202609-00001"}',
  };

  it("初めての鍵は実行する", () => {
    expect(decideIdempotency(null, "abc")).toEqual({ kind: "proceed" });
  });

  // ★ ここが要。再送で 2 本目の ORD- を採番させない。
  it("同じ鍵・同じ要求は、保存した応答をそのまま返す（再実行しない）", () => {
    expect(decideIdempotency(stored, stored.requestHash)).toEqual({
      kind: "replay",
      status: 201,
      body: stored.responseBody,
    });
  });

  it("同じ鍵で違う要求は拒む（黙って古い応答を返さない）", () => {
    expect(decideIdempotency(stored, "different")).toEqual({
      kind: "conflict",
    });
  });
});

describe("etagOf / parseIfMatch", () => {
  it("ETag は弱い（W/）", () => {
    expect(etagOf(NOW)).toBe('W/"2026-09-10T00:00:00.000Z"');
  });
  it("* を読む", () =>
    expect(parseIfMatch("*")).toEqual({ any: true, tags: [] }));
  it("並びを読む", () => {
    expect(parseIfMatch(' W/"a" , W/"b" ')).toEqual({
      any: false,
      tags: ['W/"a"', 'W/"b"'],
    });
  });
  it("空は空", () =>
    expect(parseIfMatch(null)).toEqual({ any: false, tags: [] }));
});

describe("decideConcurrency", () => {
  // ★ 無指定を素通ししない。いちばん雑な呼び出し側が
  //   いちばん危険な経路を通る設計にしない。
  it("If-Match が無ければ拒む", () => {
    expect(decideConcurrency(null, NOW)).toEqual({ kind: "required" });
    expect(decideConcurrency("", NOW)).toEqual({ kind: "required" });
  });

  it("版が一致すれば通す", () => {
    expect(decideConcurrency(etagOf(NOW), NOW)).toEqual({ kind: "ok" });
  });

  it("版が違えば止める", () => {
    expect(decideConcurrency(etagOf(OTHER), NOW)).toEqual({ kind: "stale" });
  });

  it("* は明示的な上書きとして通す", () => {
    expect(decideConcurrency("*", NOW)).toEqual({ kind: "ok" });
  });

  it("並びのどれかが一致すれば通す", () => {
    expect(decideConcurrency(`W/"x", ${etagOf(NOW)}`, NOW)).toEqual({
      kind: "ok",
    });
  });
});
