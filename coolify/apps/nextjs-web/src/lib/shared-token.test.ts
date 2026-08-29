/**
 * shared-token.test.ts — 共有シークレット照合。
 *
 * 一番大事なのは「長さが違っても throw しない」こと — timingSafeEqual は
 * 長さ違いで例外を投げるので、そこを素通しすると 500 の有無でトークン長が
 * 漏れる（かつ、呼び出し側が落ちる）。
 */

import { describe, expect, it } from "vitest";
import { tokenMatches } from "./shared-token";

describe("tokenMatches", () => {
  it("一致すれば true", () => {
    expect(tokenMatches("s3cret-token", "s3cret-token")).toBe(true);
  });

  it("値が違えば false", () => {
    expect(tokenMatches("s3cret-token", "s3cret-tokeN")).toBe(false);
  });

  it("長さが違っても throw せず false", () => {
    expect(() => tokenMatches("short", "much-longer-token")).not.toThrow();
    expect(tokenMatches("short", "much-longer-token")).toBe(false);
    expect(tokenMatches("much-longer-token", "short")).toBe(false);
  });

  it("与えられた側が null / 空なら false", () => {
    expect(tokenMatches(null, "s3cret-token")).toBe(false);
    expect(tokenMatches("", "s3cret-token")).toBe(false);
  });

  it("期待値が空文字なら常に false（env を空にしても開かない）", () => {
    expect(tokenMatches("", "")).toBe(false);
    expect(tokenMatches("anything", "")).toBe(false);
  });

  it("マルチバイトを含むトークンもバイト列で比較する", () => {
    expect(tokenMatches("トークン", "トークン")).toBe(true);
    expect(tokenMatches("トークン", "トークソ")).toBe(false);
  });
});
