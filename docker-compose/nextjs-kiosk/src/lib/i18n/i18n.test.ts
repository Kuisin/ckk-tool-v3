import { describe, expect, it } from "vitest";
import { getMessages, LOCALES, normalizeLocale } from "./index";

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
      expect(m.launcher.greeting("A")).toContain("A");
      expect(typeof m.activity.autoLogout("1:00")).toBe("string");
    }
  });
});
