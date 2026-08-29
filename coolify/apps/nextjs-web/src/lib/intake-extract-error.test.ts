/**
 * intake-extract-error.test.ts — 抽出失敗の分類・保存形式・読み戻し。
 *
 * 大事なのは 2 つ:
 *  - 自動再試行の対象（retryable）を取り違えないこと（壊れたファイルを
 *    3 回流しても直らないし、混雑中の 503 を 1 回で諦める理由も無い）
 *  - 保存した文字列を読み戻すと、画面に出す 4 要素（何が / 原因 / 対処 /
 *    再試行状況）が復元できること。旧形式（1 行）も壊れないこと。
 */

import { describe, expect, it } from "vitest";
import {
  classifyHttpFailure,
  classifyLocalFailure,
  classifyNetworkFailure,
  classifyTimeoutFailure,
  extractServerDetail,
  formatExtractError,
  networkErrorCode,
  parseExtractError,
  retryPlan,
} from "./intake-extract-error";

describe("extractServerDetail", () => {
  it("FastAPI の detail を取り出す", () => {
    expect(
      extractServerDetail(
        '{"detail":"structuring model did not return valid JSON"}',
      ),
    ).toBe("structuring model did not return valid JSON");
  });

  it("プロキシの HTML は捨てる（手がかりにならない）", () => {
    expect(
      extractServerDetail("<html><body>502 Bad Gateway</body></html>"),
    ).toBeNull();
    expect(extractServerDetail("")).toBeNull();
    expect(extractServerDetail(null)).toBeNull();
  });

  it("素のテキストはそのまま（空白は畳む）", () => {
    expect(extractServerDetail(" upstream  timed out \n")).toBe(
      "upstream timed out",
    );
  });
});

describe("classifyHttpFailure", () => {
  it("AI が形式を外した 502 は再試行する", () => {
    const f = classifyHttpFailure(
      502,
      '{"detail":"structuring model did not return valid JSON"}',
    );
    expect(f.retryable).toBe(true);
    expect(f.summary).toContain("AI");
    expect(f.detail).toContain("HTTP 502");
  });

  it("サーバー不在の 502（本文なし）も再試行する", () => {
    const f = classifyHttpFailure(502, "<html>Bad Gateway</html>");
    expect(f.retryable).toBe(true);
    expect(f.summary).toBe("抽出サーバーが応答しませんでした");
  });

  it("壊れたファイル・様式なしは再試行しない", () => {
    expect(classifyHttpFailure(400, '{"detail":"empty file"}').retryable).toBe(
      false,
    );
    expect(classifyHttpFailure(404).retryable).toBe(false);
    expect(classifyHttpFailure(413).retryable).toBe(false);
  });

  it("未知の 4xx は原因を添えて諦める", () => {
    const f = classifyHttpFailure(418, '{"detail":"teapot"}');
    expect(f.retryable).toBe(false);
    expect(f.cause).toBe("teapot");
  });
});

describe("classifyNetworkFailure / Timeout / Local", () => {
  it("接続拒否は原因を言い当てて再試行する", () => {
    const err = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    });
    const f = classifyNetworkFailure(err, "http://po-extract-dev:8000/extract");
    expect(f.retryable).toBe(true);
    expect(f.cause).toContain("起動していません");
    expect(f.detail).toContain("ECONNREFUSED");
  });

  it("タイムアウトは分数で出す", () => {
    const f = classifyTimeoutFailure(15 * 60_000);
    expect(f.summary).toContain("15分");
    expect(f.retryable).toBe(true);
  });

  it("抽出結果の形違いは再試行しない（同じ結果になる）", () => {
    expect(
      classifyLocalFailure(new Error("bad shape"), "normalize").retryable,
    ).toBe(false);
    expect(classifyLocalFailure(new Error("boom"), "storage").retryable).toBe(
      true,
    );
  });
});

describe("networkErrorCode", () => {
  it("cause を辿って code を拾う", () => {
    const err = { cause: { cause: { code: "ENOTFOUND" } } };
    expect(networkErrorCode(err)).toBe("ENOTFOUND");
    expect(networkErrorCode(new Error("plain"))).toBeNull();
  });

  it("循環参照で止まらない", () => {
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(networkErrorCode(a)).toBeNull();
  });
});

describe("retryPlan", () => {
  const transient = classifyTimeoutFailure(15 * 60_000);
  const permanent = classifyHttpFailure(400, '{"detail":"empty file"}');
  const plan = (failure: typeof transient, attempt: number) =>
    retryPlan({ failure, attempt, maxAttempts: 3, baseDelayMs: 20_000 });

  it("直る見込みのある失敗を 3 回目まで試す（待ちは伸びる）", () => {
    expect(plan(transient, 1)).toEqual({ willRetry: true, delayMs: 20_000 });
    expect(plan(transient, 2)).toEqual({ willRetry: true, delayMs: 40_000 });
    expect(plan(transient, 3)).toEqual({ willRetry: false, delayMs: 0 });
  });

  it("直らない失敗は 1 回目で諦める", () => {
    expect(plan(permanent, 1).willRetry).toBe(false);
  });
});

describe("formatExtractError / parseExtractError", () => {
  const failure = classifyHttpFailure(
    502,
    '{"detail":"structuring model did not return valid JSON"}',
  );

  it("再試行待ちは retrying として読み戻せる", () => {
    const stored = formatExtractError(failure, {
      attempt: 1,
      maxAttempts: 3,
      willRetry: true,
    });
    const parsed = parseExtractError(stored);
    expect(parsed.summary).toBe(failure.summary);
    expect(parsed.cause).toBe(failure.cause);
    expect(parsed.hint).toBe(failure.hint);
    expect(parsed.detail).toBe(failure.detail);
    expect(parsed.attempt).toBe(1);
    expect(parsed.maxAttempts).toBe(3);
    expect(parsed.retrying).toBe(true);
  });

  it("打ち切りは retrying にならない", () => {
    const stored = formatExtractError(failure, {
      attempt: 3,
      maxAttempts: 3,
      willRetry: false,
    });
    const parsed = parseExtractError(stored);
    expect(parsed.attempt).toBe(3);
    expect(parsed.retrying).toBe(false);
  });

  it("再試行しない失敗は回数行を持たない", () => {
    const parsed = parseExtractError(
      formatExtractError(classifyHttpFailure(400, '{"detail":"empty file"}')),
    );
    expect(parsed.attempt).toBeUndefined();
    expect(parsed.retrying).toBe(false);
  });

  it("旧形式（1 行）も読める — 対処は必ず付く", () => {
    const parsed = parseExtractError("po-extract HTTP 502");
    expect(parsed.summary).toBe("po-extract HTTP 502");
    expect(parsed.hint).not.toBe("");
    expect(parsed.retrying).toBe(false);
  });
});

/**
 * AI プロバイダ由来の失敗。ここが効かないと、外部プロバイダの鍵違いが
 * 「抽出サーバーが混み合っています」として出て、しかも再試行を 3 回使い切る。
 */
describe("AI プロバイダ由来の失敗", () => {
  const po = (kind: string, status = 502) =>
    classifyHttpFailure(
      status,
      JSON.stringify({ detail: `ai_${kind}: something` }),
    );

  it("鍵・モデル名の誤りは再試行しない", () => {
    for (const kind of [
      "auth",
      "model_not_found",
      "bad_schema",
      "not_configured",
      "no_vision",
    ]) {
      expect(po(kind).retryable, kind).toBe(false);
    }
  });

  it("一時的な失敗は再試行する", () => {
    for (const kind of ["rate_limit", "unreachable", "upstream"]) {
      expect(po(kind).retryable, kind).toBe(true);
    }
  });

  it("原因ごとに次の一手を書き分ける", () => {
    expect(po("auth").summary).toContain("認証");
    expect(po("auth").hint).toContain("SY0E");
    expect(po("model_not_found").hint).toContain("モデル名");
    expect(po("no_vision").summary).toContain("画像");
    // 429 でも「po-extract が混んでいる」ではなくプロバイダの話にする
    expect(po("rate_limit", 429).summary).toContain("AI プロバイダ");
  });

  it("詳細に元の HTTP 状態を残す", () => {
    expect(po("auth", 502).detail).toContain("ai_auth");
    expect(po("auth", 502).detail).toContain("502");
  });

  it("知らない ai_* は既存の分類へ素通しする", () => {
    const out = classifyHttpFailure(
      502,
      JSON.stringify({ detail: "ai_wat: ?" }),
    );
    expect(out.summary).toBe("抽出サーバーが応答しませんでした");
  });

  it("従来の失敗の分類を変えない（回帰）", () => {
    const json = classifyHttpFailure(
      502,
      JSON.stringify({ detail: "structuring model did not return valid JSON" }),
    );
    expect(json.summary).toBe("AI が読み取り結果をまとめられませんでした");
    expect(json.retryable).toBe(true);

    expect(classifyHttpFailure(400).retryable).toBe(false);
    expect(classifyHttpFailure(404).summary).toContain("様式");
    expect(classifyHttpFailure(413).summary).toContain("大きすぎ");
    expect(classifyHttpFailure(429).summary).toBe(
      "抽出サーバーが混み合っています",
    );
    expect(classifyHttpFailure(503).retryable).toBe(true);
  });
});
