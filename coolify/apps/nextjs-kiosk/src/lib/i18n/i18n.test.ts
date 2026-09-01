import { describe, expect, it } from "vitest";
import { fillMessage, getMessages, LOCALES, normalizeLocale } from "./index";

describe("normalizeLocale", () => {
  it("対応言語はそのまま", () => {
    for (const l of LOCALES) expect(normalizeLocale(l)).toBe(l);
  });
  it("不明値・null・undefined は ja にフォールバック", () => {
    expect(normalizeLocale("fr")).toBe("ja");
    expect(normalizeLocale("")).toBe("ja");
    expect(normalizeLocale(null)).toBe("ja");
    expect(normalizeLocale(undefined)).toBe("ja");
  });
});

describe("getMessages", () => {
  it("全言語で辞書が引ける（キー構造は型で保証）", () => {
    for (const l of LOCALES) {
      const m = getMessages(l);
      expect(typeof m.launcher.logout).toBe("string");
      expect(fillMessage(m.launcher.greeting, { name: "A" })).toContain("A");
      expect(typeof fillMessage(m.activity.autoLogout, { time: "1:00" })).toBe(
        "string",
      );
    }
  });
});

describe("fillMessage", () => {
  it("{name} の穴を値で埋める", () => {
    expect(fillMessage("{name} さん", { name: "田中" })).toBe("田中 さん");
  });
  it("複数の穴を埋める", () => {
    expect(fillMessage("{start}〜{end}", { start: "9:00", end: "17:00" })).toBe(
      "9:00〜17:00",
    );
  });
  it("穴が無い変数は無視し、埋まらない穴はそのまま残す", () => {
    expect(fillMessage("完了 {done} / {total} 工程", { done: 3 })).toBe(
      "完了 3 / {total} 工程",
    );
  });
});
