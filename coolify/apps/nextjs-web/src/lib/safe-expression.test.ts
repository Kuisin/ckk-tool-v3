/**
 * safe-expression.test.ts — 式言語の文法と、脱出経路が塞がっていることの固定。
 */

import { describe, expect, it } from "vitest";
import {
  compileExpression,
  ExpressionSyntaxError,
  evaluateExpression,
  parseExpression,
} from "./safe-expression";

const ev = (expr: string, scope: Record<string, unknown> = {}) =>
  evaluateExpression(expr, scope);

describe("safe-expression — 文法", () => {
  it("算術・比較・論理・三項・カンマ・括弧", () => {
    expect(ev("1 + 2 * 3")).toBe(7);
    expect(ev("(1 + 2) * 3")).toBe(9);
    expect(ev("10 % 4 - -1")).toBe(3);
    expect(ev("2 <= 2 && 3 > 1 || false")).toBe(true);
    expect(ev("1 === '1'")).toBe(false);
    expect(ev("1 == '1'")).toBe(true);
    expect(ev("x > 5 ? 'big' : 'small'", { x: 7 })).toBe("big");
    expect(ev("(1, 2, 3)")).toBe(3);
    expect(ev("null ?? 0 ?? 9")).toBe(0);
    expect(ev("!0")).toBe(true);
    expect(ev("+'3' + 1")).toBe(4);
    expect(ev("1e3 + .5 + 2.")).toBe(1002.5);
    expect(ev("'a\\'b' + \"c\"")).toBe("a'bc");
    expect(ev("true && null")).toBe(null);
  });

  it("識別子は scope だけを引き、無い名前は undefined", () => {
    expect(ev("a + b", { a: 1, b: 2 })).toBe(3);
    expect(ev("typeof nothing")).toBe("undefined");
    expect(ev("typeof process === 'undefined' ? 7 : 999")).toBe(7);
  });

  it("メンバ参照は自身のプロパティだけ（?. と [] も）", () => {
    const r = { material: 10, step: 5 };
    expect(ev("r.material + r.step", { r })).toBe(15);
    expect(ev("r['material']", { r })).toBe(10);
    expect(ev("r.missing", { r })).toBeUndefined();
    expect(ev("r?.material", { r })).toBe(10);
    expect(ev("nothing?.x")).toBeUndefined();
    expect(() => ev("nothing.x")).toThrow(TypeError);
    expect(ev("list.length + list[1]", { list: [4, 5] })).toBe(7);
    expect(ev("'abc'.length")).toBe(3);
  });

  it("関数はヘルパー（識別子）だけ呼べ、this は渡らない", () => {
    const round = (n: number, unit = 10) => Math.ceil(n / unit) * unit;
    expect(ev("round(123, 10)", { round })).toBe(130);
    expect(ev("round(123)", { round })).toBe(130);
    // プロトタイプのメソッドは見えないので呼べない
    expect(() => ev("r.toString()", { r: {} })).toThrow(TypeError);
    expect(() => ev("notFn(1)", { notFn: 3 })).toThrow(TypeError);
    // 組み込みは値の変換と Math だけ
    expect(ev("Math.max(1, 5, 3) + Number('2')")).toBe(7);
    expect(ev("Math.round(2.5)")).toBe(3);
    expect(ev("typeof Math.random")).toBe("undefined");
    expect(ev("typeof Date")).toBe("undefined");
    expect(ev("typeof fetch")).toBe("undefined");
  });

  it("コメントと改行を含む既定の式が読める", () => {
    const expr = `stepLength >= 0.01 && stepType !== 'NONE'
  ? (lookupMatrix(STEP_MACHINING, maxDiameter, stepLength) == null
       ? warn('段加工費が範囲外です') : null,
     (lookupMatrix(STEP_MACHINING, maxDiameter, stepLength) ?? 0) * stepTypeRate(stepType)) // 段
  : 0 /* なし */`;
    const warnings: string[] = [];
    const scope = {
      stepLength: 1,
      stepType: "A",
      maxDiameter: 8,
      STEP_MACHINING: {},
      lookupMatrix: () => 100,
      stepTypeRate: () => 1.5,
      warn: (m: string) => {
        warnings.push(m);
        return null;
      },
    };
    expect(ev(expr, scope)).toBe(150);
    expect(warnings).toEqual([]);
  });

  it("compileExpression は paramNames の順で値を束縛する", () => {
    const fn = compileExpression(["a", "b"], "a * b");
    expect(fn(6, 7)).toBe(42);
    expect(fn(2)).toBeNaN();
  });
});

describe("safe-expression — 脱出経路", () => {
  const scope = { r: { material: 1 }, round: (n: number) => n };

  it("constructor / __proto__ / prototype は参照できない", () => {
    expect(() => parseExpression("r.constructor")).toThrow(
      ExpressionSyntaxError,
    );
    expect(() => parseExpression("r.__proto__")).toThrow(ExpressionSyntaxError);
    expect(() => parseExpression("round.prototype")).toThrow(
      ExpressionSyntaxError,
    );
    // 添字経由でも届かない
    expect(ev("r['constructor']", scope)).toBeUndefined();
    expect(ev("r['__proto__']", scope)).toBeUndefined();
    expect(ev("round['constructor']", scope)).toBeUndefined();
    expect(ev("Math['constructor']")).toBeUndefined();
    expect(ev("Number['prototype']")).toBeUndefined();
  });

  it("function / => / new / this / テンプレート文字列は構文エラー", () => {
    for (const bad of [
      "(function(){ return 1 })()",
      "(() => 1)()",
      "new Date()",
      "this",
      "`$" + "{1}`",
      "a = 1",
      "r.material = 2",
      "eval('1')",
      "import('x')",
      "[1,2].map(x => x)",
    ]) {
      expect(() => parseExpression(bad), bad).toThrow(ExpressionSyntaxError);
    }
  });

  it("プロトタイプ連鎖のプロパティは読めない（Object.hasOwn だけ）", () => {
    expect(ev("r.hasOwnProperty", scope)).toBeUndefined();
    expect(ev("r.valueOf", scope)).toBeUndefined();
    expect(ev("r.toString", scope)).toBeUndefined();
  });

  it("深すぎる・長すぎる式は拒否", () => {
    expect(() =>
      parseExpression(`${"(".repeat(100)}1${")".repeat(100)}`),
    ).toThrow(/深すぎます/);
    expect(() => parseExpression(`1 + ${"1 + ".repeat(2000)}1`)).toThrow(
      /長すぎます/,
    );
  });

  it("空・閉じ忘れ・未知の文字", () => {
    expect(() => parseExpression("")).toThrow(/空/);
    expect(() => parseExpression("(1 + 2")).toThrow(ExpressionSyntaxError);
    expect(() => parseExpression("'abc")).toThrow(/閉じていません/);
    expect(() => parseExpression("1 # 2")).toThrow(/使えない文字/);
    expect(() => parseExpression("1 2")).toThrow(/余分/);
  });
});
