import { describe, expect, it } from "vitest";
import { nextTabsCollapsed, TAB_COLLAPSE_HYSTERESIS } from "./tab-overflow";

describe("nextTabsCollapsed", () => {
  it("横並びで収まらなくなったら畳む", () => {
    expect(nextTabsCollapsed(false, 501, 500)).toBe(true);
  });

  it("ちょうど収まっているうちは畳まない", () => {
    expect(nextTabsCollapsed(false, 500, 500)).toBe(null);
  });

  it("畳んだあと、余白を持って収まるようになったら戻す", () => {
    expect(nextTabsCollapsed(true, 500, 500 + TAB_COLLAPSE_HYSTERESIS)).toBe(
      false,
    );
  });

  it("境界では往復しない — 畳む条件と戻す条件の間に隙間がある", () => {
    // 幅 500 で必要 500: 横並びなら畳まないし、畳んだ状態なら戻さない
    // （戻すと needed > available になって、また畳むことになる）。
    expect(nextTabsCollapsed(false, 500, 500)).toBe(null);
    expect(nextTabsCollapsed(true, 500, 500)).toBe(null);
    expect(nextTabsCollapsed(true, 500, 507)).toBe(null);
  });

  it("測れないとき（幅 0・NaN）は何も変えない", () => {
    expect(nextTabsCollapsed(false, 500, 0)).toBe(null);
    expect(nextTabsCollapsed(true, 500, 0)).toBe(null);
    expect(nextTabsCollapsed(false, Number.NaN, 500)).toBe(null);
  });
});
