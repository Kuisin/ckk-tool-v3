import { describe, expect, it } from "vitest";
import {
  buildProblem,
  forbiddenProblem,
  PROBLEM_STATUS,
  PROBLEM_TITLES,
  type ProblemCode,
  unauthorizedProblem,
} from "./api-problem-core";

const CODES = Object.keys(PROBLEM_TITLES) as ProblemCode[];

describe("buildProblem", () => {
  it("RFC 9457 の必須メンバと code を持つ", () => {
    const p = buildProblem({ code: "not_found", instance: "/api/v1/quotes/x" });
    expect(p).toEqual({
      type: "/problems/not_found",
      title: "Not found",
      status: 404,
      code: "not_found",
      instance: "/api/v1/quotes/x",
    });
  });

  it("status は明示があればそれを使う", () => {
    expect(buildProblem({ code: "conflict", status: 412 }).status).toBe(412);
  });

  it("detail / instance が無ければ鍵ごと出さない", () => {
    const p = buildProblem({ code: "internal_error" });
    expect("detail" in p).toBe(false);
    expect("instance" in p).toBe(false);
  });
});

describe("表は網羅されている", () => {
  it.each(CODES)("%s に title と status がある", (code) => {
    expect(PROBLEM_TITLES[code]).toBeTruthy();
    expect(PROBLEM_STATUS[code]).toBeGreaterThanOrEqual(400);
  });

  it("凍結されている（実行時に書き換えられない）", () => {
    expect(Object.isFrozen(PROBLEM_TITLES)).toBe(true);
    expect(Object.isFrozen(PROBLEM_STATUS)).toBe(true);
  });
});

// ★ 誤り本文を誰かが next-intl に通したら、この試験が落ちる。
describe("本文は英語で固定（翻訳しない）", () => {
  it("title は ASCII のみ", () => {
    for (const code of CODES) {
      expect(PROBLEM_TITLES[code]).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  it("detail も ASCII のみ", () => {
    const details = [
      unauthorizedProblem().detail ?? "",
      forbiddenProblem("quote", "CREATE").detail ?? "",
    ];
    for (const d of details) expect(d).toMatch(/^[\x20-\x7E]+$/);
  });
});

describe("unauthorizedProblem", () => {
  it("401 で、理由を含まない", () => {
    const p = unauthorizedProblem("/api/v1/me");
    expect(p.status).toBe(401);
    expect(p.code).toBe("unauthorized");
    expect(p.detail).toBe("A valid API token is required.");
  });
});

describe("forbiddenProblem", () => {
  // 認証は通っているので、こちらは具体的でよい（自分で直せる情報）。
  it("必要な権限を具体的に返す", () => {
    const p = forbiddenProblem("quote", "CREATE", "/api/v1/quotes");
    expect(p.status).toBe(403);
    expect(p.detail).toBe("Requires quote:CREATE.");
  });
});
