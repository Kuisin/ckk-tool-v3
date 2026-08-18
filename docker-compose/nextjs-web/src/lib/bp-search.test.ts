import { describe, expect, it } from "vitest";
import { bpMatchesQuery, bpSearchKeys, searchKey } from "./bp-search";

/**
 * 人が取引先を探すときの当たり方。照合キー（AI 用に貯めた表記ゆれ）を
 * 検索にも使うことで、「読みしか分からない」「THK しか覚えていない」
 * といった探し方でも辿り着けるようにする。
 */

const thk = {
  bpCode: "BP-01043",
  nameJa: "THK株式会社",
  nameKana: "ティーエイチケー",
  matchNames: ["THK", "株式会社THK", "THK(株)", "THK㈱"],
  matchNamesAuto: ["ティーエイチケー", "てぃーえいちけー", "tieichike"],
};

describe("searchKey", () => {
  it("全角・大文字小文字・記号の違いを吸収する", () => {
    expect(searchKey("ＴＨＫ")).toBe(searchKey("thk"));
    expect(searchKey("THK (株)")).toBe(searchKey("THK株"));
    expect(searchKey("シー・ケイ・ケー")).toBe(searchKey("シーケイケー"));
  });
});

describe("bpMatchesQuery", () => {
  it("社名の一部で当たる", () => {
    expect(bpMatchesQuery(thk, "THK")).toBe(true);
    expect(bpMatchesQuery(thk, "株式会社")).toBe(true);
  });

  it("**フリガナ（カタカナ・ひらがな）で当たる**", () => {
    expect(bpMatchesQuery(thk, "ティーエイチ")).toBe(true);
    expect(bpMatchesQuery(thk, "てぃーえいちけー")).toBe(true);
  });

  it("**ローマ字で当たる**", () => {
    expect(bpMatchesQuery(thk, "tieichike")).toBe(true);
    expect(bpMatchesQuery(thk, "TIEICHIKE")).toBe(true);
  });

  it("小文字・全角で打っても当たる", () => {
    expect(bpMatchesQuery(thk, "ｔｈｋ")).toBe(true);
  });

  it("BP コードで当たる", () => {
    expect(bpMatchesQuery(thk, "01043")).toBe(true);
  });

  it("㈱ と (株) の違いで外さない", () => {
    expect(bpMatchesQuery(thk, "THK㈱")).toBe(true);
    expect(bpMatchesQuery(thk, "THK(株)")).toBe(true);
  });

  it("関係ない語では当たらない", () => {
    expect(bpMatchesQuery(thk, "デンソー")).toBe(false);
  });

  it("空の入力はすべて通す（絞り込み無し）", () => {
    expect(bpMatchesQuery(thk, "")).toBe(true);
    expect(bpMatchesQuery(thk, "   ")).toBe(true);
  });

  it("キーが無い取引先でも落ちない", () => {
    expect(bpMatchesQuery({}, "なにか")).toBe(false);
    expect(bpSearchKeys({})).toEqual([]);
  });
});
