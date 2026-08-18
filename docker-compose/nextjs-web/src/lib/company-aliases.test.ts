import { describe, expect, it } from "vitest";
import {
  companyCore,
  generateAliases,
  kanaToRomaji,
  missingKeywordFormats,
  toHiragana,
  toKatakana,
} from "./company-aliases";

/**
 * 照合名の自動生成。**作れないものを作らない**ことが同じくらい大事で、
 * 漢字の読みを勝手に決めてしまうと、別会社に誤って一致する。
 */

describe("かな変換", () => {
  it("ひらがな ⇄ カタカナ", () => {
    expect(toKatakana("せらみっく")).toBe("セラミック");
    expect(toHiragana("セラミック")).toBe("せらみっく");
    // 長音符・記号は素通し
    expect(toKatakana("とうきょう・せらみっく")).toBe("トウキョウ・セラミック");
  });

  it("半角カナも全角にしてから変換する", () => {
    expect(toHiragana("ｾﾗﾐｯｸ")).toBe("せらみっく");
  });
});

describe("kanaToRomaji（ヘボン式）", () => {
  it("基本の音", () => {
    expect(kanaToRomaji("トウキョウ")).toBe("toukyou");
    expect(kanaToRomaji("オオサカ")).toBe("oosaka");
  });

  it("拗音", () => {
    expect(kanaToRomaji("キャノン")).toBe("kyanon");
    expect(kanaToRomaji("ショウジ")).toBe("shouji");
    expect(kanaToRomaji("チョウダ")).toBe("chouda");
  });

  it("促音は次の子音を重ねる", () => {
    expect(kanaToRomaji("ニッポン")).toBe("nippon");
    expect(kanaToRomaji("キッコー")).toBe("kikko");
  });

  it("長音符は落とす", () => {
    expect(kanaToRomaji("セラミック")).toBe("seramikku");
    expect(kanaToRomaji("コーヨー")).toBe("koyo");
  });

  it("かな以外はそのまま残す", () => {
    expect(kanaToRomaji("AFCジャパン")).toBe("AFCjapan");
  });
});

describe("companyCore", () => {
  it("法人格を落とす（前後どちらでも）", () => {
    expect(companyCore("株式会社シー・ケイ・ケー")).toBe("シー・ケイ・ケー");
    expect(companyCore("シー・ケイ・ケー株式会社")).toBe("シー・ケイ・ケー");
    expect(companyCore("(有)東京セラミック")).toBe("東京セラミック");
    expect(companyCore("㈱大阪工業")).toBe("大阪工業");
  });
});

describe("generateAliases", () => {
  it("法人格の表記ゆれを並べる", () => {
    const out = generateAliases({ nameJa: "東京精機株式会社" });
    expect(out).toContain("東京精機");
    expect(out).toContain("東京精機(株)");
    expect(out).toContain("株式会社東京精機");
  });

  it("全角英字は半角も候補にする", () => {
    const out = generateAliases({ nameJa: "ＡＦＣジャパン" });
    expect(out).toContain("AFCジャパン");
  });

  it("かなだけの社名は かな 3 形式を作れる", () => {
    const out = generateAliases({ nameJa: "セラミック商事" });
    // 「商事」は漢字なので読みは作らない
    expect(out.some((v) => /[ぁ-ゖ]/.test(v))).toBe(false);

    const kanaOnly = generateAliases({ nameJa: "トウキョウセラミック" });
    expect(kanaOnly).toContain("とうきょうせらみっく");
    expect(kanaOnly).toContain("toukyouseramikku");
  });

  it("フリガナがあれば漢字社名でも 3 形式を作れる", () => {
    const out = generateAliases({
      nameJa: "東京精機株式会社",
      nameKana: "トウキョウセイキ",
    });
    expect(out).toContain("トウキョウセイキ");
    expect(out).toContain("とうきょうせいき");
    expect(out).toContain("toukyouseiki");
  });

  it("**漢字の読みは勝手に作らない**（フリガナが無いとき）", () => {
    const out = generateAliases({ nameJa: "東京精機株式会社" });
    expect(out).not.toContain("とうきょうせいき");
    expect(out.some((v) => /^[a-z]+$/.test(v))).toBe(false);
  });

  it("既存の照合名と元の社名は返さない", () => {
    const out = generateAliases({
      nameJa: "東京精機株式会社",
      existing: ["東京精機"],
    });
    expect(out).not.toContain("東京精機");
    expect(out).not.toContain("東京精機株式会社");
  });

  it("英語名・略称も候補にする", () => {
    const out = generateAliases({
      nameJa: "東京精機株式会社",
      nameEn: "Tokyo Seiki Co., Ltd.",
      shortName: "TSK",
    });
    expect(out).toContain("Tokyo Seiki Co., Ltd.");
    expect(out).toContain("TSK");
  });
});

describe("missingKeywordFormats", () => {
  it("漢字社名でフリガナ無し → 3 形式とも欠け、読みが要る", () => {
    expect(missingKeywordFormats({ nameJa: "東京精機株式会社" })).toEqual({
      hiragana: true,
      katakana: true,
      romaji: true,
      needsReading: true,
    });
  });

  it("かな社名は読み不要（カタカナは充足）", () => {
    const m = missingKeywordFormats({ nameJa: "トウキョウセラミック" });
    expect(m.needsReading).toBe(false);
    expect(m.katakana).toBe(false);
    expect(m.hiragana).toBe(true);
  });

  it("登録済みの照合名で充足を判定する", () => {
    const m = missingKeywordFormats({
      nameJa: "東京精機株式会社",
      nameKana: "トウキョウセイキ",
      existing: ["とうきょうせいき", "トウキョウセイキ", "toukyouseiki"],
    });
    expect(m).toEqual({
      hiragana: false,
      katakana: false,
      romaji: false,
      needsReading: false,
    });
  });

  it("英語名だけでもローマ字は充足とみなす", () => {
    const m = missingKeywordFormats({
      nameJa: "東京精機株式会社",
      existing: ["Tokyo Seiki"],
    });
    expect(m.romaji).toBe(false);
  });
});
