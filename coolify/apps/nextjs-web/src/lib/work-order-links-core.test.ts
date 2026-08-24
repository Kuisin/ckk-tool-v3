/**
 * work-order-links-core.test.ts — 指示書→指示書リンクの不変条件検証。
 */

import { describe, expect, it } from "vitest";
import {
  validateNewWoLink,
  type WoLinkEdge,
  wouldCreateCycle,
} from "./work-order-links-core";

const edge = (s: string, t: string): WoLinkEdge => ({
  sourceWorkOrderId: s,
  targetWorkOrderId: t,
});

describe("wouldCreateCycle", () => {
  it("自己リンクは閉路", () => {
    expect(wouldCreateCycle([], edge("a", "a"))).toBe(true);
  });

  it("逆向きの既存エッジがあると閉路", () => {
    expect(wouldCreateCycle([edge("a", "b")], edge("b", "a"))).toBe(true);
  });

  it("推移的な閉路も検出（a→b→c に c→a）", () => {
    const edges = [edge("a", "b"), edge("b", "c")];
    expect(wouldCreateCycle(edges, edge("c", "a"))).toBe(true);
  });

  it("閉路にならない追加は許可（チェーン・扇形）", () => {
    const edges = [edge("a", "b"), edge("b", "c")];
    expect(wouldCreateCycle(edges, edge("a", "c"))).toBe(false);
    expect(wouldCreateCycle(edges, edge("c", "d"))).toBe(false);
    expect(wouldCreateCycle(edges, edge("x", "b"))).toBe(false);
  });
});

describe("validateNewWoLink", () => {
  it("自己 / 重複 / 数量 / 閉路の順で検出", () => {
    expect(validateNewWoLink([], edge("a", "a"), null)?.kind).toBe("SELF");
    expect(
      validateNewWoLink([edge("a", "b")], edge("a", "b"), null)?.kind,
    ).toBe("DUPLICATE");
    expect(validateNewWoLink([], edge("a", "b"), 0)?.kind).toBe("QUANTITY");
    expect(validateNewWoLink([], edge("a", "b"), 1.5)?.kind).toBe("QUANTITY");
    expect(
      validateNewWoLink([edge("b", "a")], edge("a", "b"), null)?.kind,
    ).toBe("CYCLE");
  });

  it("正常な追加は null（quantity null = 全量も可）", () => {
    expect(validateNewWoLink([], edge("a", "b"), null)).toBeNull();
    expect(validateNewWoLink([edge("a", "b")], edge("a", "c"), 5)).toBeNull();
  });
});
