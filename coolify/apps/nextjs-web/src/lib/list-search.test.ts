import { describe, expect, it } from "vitest";
import { listSearchKey, listSearchMatch } from "./list-search";

describe("listSearchKey", () => {
  it("全角の英数字を半角に畳む（IME が全角のまま打たれる）", () => {
    expect(listSearchKey("ｄｅｍｏ１")).toBe("demo1");
  });
  it("大文字小文字を畳む", () => {
    expect(listSearchKey("DEMO")).toBe("demo");
  });
  it("カタカナをひらがなに畳む（半角カナも NFKC 経由で拾う）", () => {
    expect(listSearchKey("タナカ")).toBe("たなか");
    expect(listSearchKey("ﾀﾅｶ")).toBe("たなか");
  });
  it("空白を落とす（全角・半角とも）", () => {
    expect(listSearchKey("田中 一郎")).toBe("田中一郎");
    expect(listSearchKey("田中　一郎")).toBe("田中一郎");
  });
  it("記号は残す — 括弧を落とすと別の語と混ざる", () => {
    expect(listSearchKey("管理職（承認者）")).toBe("管理職(承認者)");
  });
});

describe("listSearchMatch", () => {
  it("空の検索語は絞り込まない", () => {
    expect(listSearchMatch("", ["なんでも"])).toBe(true);
    expect(listSearchMatch("   ", [null])).toBe(true);
  });
  it("null / undefined の候補を飛ばす", () => {
    expect(listSearchMatch("あ", [null, undefined, "あい"])).toBe(true);
    expect(listSearchMatch("あ", [null, undefined])).toBe(false);
  });
  it("空白をまたいで一致する（報告された症状）", () => {
    expect(listSearchMatch("田中一郎", ["田中 一郎（管理）"])).toBe(true);
  });
  it("全角で打った英字がユーザー名に当たる（報告された症状）", () => {
    expect(listSearchMatch("ｄｅｍｏ", ["demo2"])).toBe(true);
  });
  it("括弧つきのロール名がそのまま当たる（報告された症状）", () => {
    expect(listSearchMatch("管理職（承認者）", ["管理職（承認者）"])).toBe(
      true,
    );
    // 半角括弧で打っても同じ鍵になる
    expect(listSearchMatch("管理職(承認者)", ["管理職（承認者）"])).toBe(true);
  });
  it("関係ない語では当たらない", () => {
    expect(listSearchMatch("佐藤", ["田中 一郎", "demo1"])).toBe(false);
  });
});
