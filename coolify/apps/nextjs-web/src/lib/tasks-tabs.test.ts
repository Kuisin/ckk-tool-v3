import { describe, expect, it } from "vitest";
import {
  resolveActiveTab,
  sanitizeHiddenTabs,
  TASK_TABS,
  visibleTaskTabs,
} from "./tasks-tabs";

const ALL = TASK_TABS.map((t) => t.id);

describe("sanitizeHiddenTabs", () => {
  it("{ hidden: [...] } でも配列そのままでも読む", () => {
    expect(sanitizeHiddenTabs({ hidden: ["comments"] })).toEqual(["comments"]);
    expect(sanitizeHiddenTabs(["comments"])).toEqual(["comments"]);
  });

  it("知らない id・重複・文字列でない値は捨てる", () => {
    expect(
      sanitizeHiddenTabs({
        hidden: ["comments", "comments", "nope", 3, null],
      }),
    ).toEqual(["comments"]);
  });

  it("壊れた値・未設定は空（＝全部出す）", () => {
    expect(sanitizeHiddenTabs(null)).toEqual([]);
    expect(sanitizeHiddenTabs("comments")).toEqual([]);
    expect(sanitizeHiddenTabs({})).toEqual([]);
  });
});

describe("visibleTaskTabs", () => {
  it("出せるタブから隠す設定を引き、定義順で返す", () => {
    const visible = visibleTaskTabs(ALL, ["approvals", "comments"]);
    expect(visible.map((t) => t.id)).toEqual([
      "plans",
      "forms",
      "my-forms",
      "completions",
    ]);
  });

  it("出せないタブは隠す設定に関わらず出ない", () => {
    const visible = visibleTaskTabs(["plans", "comments"], []);
    expect(visible.map((t) => t.id)).toEqual(["plans", "comments"]);
  });

  it("全部隠されたら設定を無視して全部出す（行き止まりを作らない）", () => {
    const visible = visibleTaskTabs(["plans", "forms"], ALL);
    expect(visible.map((t) => t.id)).toEqual(["plans", "forms"]);
  });
});

describe("resolveActiveTab", () => {
  const visible = visibleTaskTabs(ALL, ["plans"]);

  it("出ているタブならそのまま", () => {
    expect(resolveActiveTab("forms", visible)).toBe("forms");
  });

  it("隠したタブ・知らない値・未指定は先頭のタブへ落とす", () => {
    expect(resolveActiveTab("plans", visible)).toBe("approvals");
    expect(resolveActiveTab("nope", visible)).toBe("approvals");
    expect(resolveActiveTab(null, visible)).toBe("approvals");
  });

  it("出せるタブが 1 枚も無ければ定義の先頭（画面が壊れない）", () => {
    expect(resolveActiveTab("forms", [])).toBe("plans");
  });
});
