import { describe, expect, it } from "vitest";
import {
  KEYWORD_MAX_COUNT,
  KEYWORD_MAX_LENGTH,
  keywordSearchKeys,
  matchesKeywordQuery,
  newKeywords,
  normalizeKeywords,
} from "./master-keywords";

/**
 * 製品・素材のキーワード。取引先の照合名と同じで、**登録した表記そのもの**は
 * 加工せずに残しつつ、当たり判定は表記ゆれを吸収する。
 */

const drill = {
  code: "PRD-202608-0012",
  name: "超硬ドリル φ8.3",
  keywords: ["チョウコウドリル", "carbide drill", "Φ８．３", "D8.3"],
  extra: ["B01B0001 — K40UF"],
};

describe("normalizeKeywords", () => {
  it("前後の空白を落とし、空の値を捨てる", () => {
    expect(normalizeKeywords([" ドリル ", "", "   ", "ＤＲＩＬＬ"])).toEqual([
      "ドリル",
      "ＤＲＩＬＬ",
    ]);
  });

  it("表記ゆれの重複は先に来たものを残す（全角は全角のまま）", () => {
    expect(normalizeKeywords(["ＴＨＫ", "THK", "thk"])).toEqual(["ＴＨＫ"]);
  });

  it("長すぎる語は落とす", () => {
    const long = "あ".repeat(KEYWORD_MAX_LENGTH + 1);
    expect(normalizeKeywords([long, "ドリル"])).toEqual(["ドリル"]);
  });

  it("件数の上限で打ち切る", () => {
    const many = Array.from(
      { length: KEYWORD_MAX_COUNT + 10 },
      (_, i) => `k${i}`,
    );
    expect(normalizeKeywords(many)).toHaveLength(KEYWORD_MAX_COUNT);
  });
});

describe("newKeywords", () => {
  it("登録済みの語は候補から外す（表記ゆれも同じ語とみなす）", () => {
    expect(newKeywords(["ドリル", "ｄｒｉｌｌ", "リーマ"], ["DRILL"])).toEqual([
      "ドリル",
      "リーマ",
    ]);
  });

  it("生成側の重複も 1 つにまとめる", () => {
    expect(newKeywords(["リーマ", "リーマ"], [])).toEqual(["リーマ"]);
  });
});

describe("matchesKeywordQuery", () => {
  it("名称の一部で当たる", () => {
    expect(matchesKeywordQuery(drill, "超硬")).toBe(true);
  });

  it("**キーワード（カタカナ読み・英語）で当たる**", () => {
    expect(matchesKeywordQuery(drill, "チョウコウ")).toBe(true);
    expect(matchesKeywordQuery(drill, "carbide")).toBe(true);
  });

  it("寸法の別表記で当たる（全角・φ の有無）", () => {
    expect(matchesKeywordQuery(drill, "Φ8.3")).toBe(true);
    expect(matchesKeywordQuery(drill, "d8.3")).toBe(true);
  });

  it("コードの一部で当たる", () => {
    expect(matchesKeywordQuery(drill, "202608")).toBe(true);
  });

  it("材種など追加の検索対象でも当たる", () => {
    expect(matchesKeywordQuery(drill, "K40UF")).toBe(true);
  });

  it("関係ない語では当たらない", () => {
    expect(matchesKeywordQuery(drill, "エンドミル")).toBe(false);
  });

  it("空の入力はすべて通す（絞り込み無し）", () => {
    expect(matchesKeywordQuery(drill, "  ")).toBe(true);
  });
});

describe("keywordSearchKeys", () => {
  it("空の項目は鍵にしない", () => {
    expect(
      keywordSearchKeys({ code: null, name: "", keywords: ["", " "] }),
    ).toEqual([]);
  });
});
