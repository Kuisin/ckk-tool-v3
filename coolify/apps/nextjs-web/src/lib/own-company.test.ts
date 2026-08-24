import { describe, expect, it } from "vitest";
import { isOwnCompany, normalizeCompanyName } from "./own-company";

/**
 * 自社を顧客として取り込まないための判定。ここが緩いと、向きを取り違えた
 * 抽出（宛先＝自社を顧客として拾う）を素通ししてしまう。
 */

describe("normalizeCompanyName", () => {
  it("法人格・記号・全角半角の違いを吸収する", () => {
    const key = normalizeCompanyName("シー・ケイ・ケー株式会社");
    expect(normalizeCompanyName("株式会社シー・ケイ・ケー")).toBe(key);
    expect(normalizeCompanyName("シーケイケー")).toBe(key);
    expect(normalizeCompanyName("（株）シー・ケイ・ケー")).toBe(key);
  });

  it("英字表記も大文字・記号を落として揃える", () => {
    expect(normalizeCompanyName("CKK Co., Ltd.")).toBe(
      normalizeCompanyName("C.K.K."),
    );
  });

  it("別会社は別の鍵になる", () => {
    expect(normalizeCompanyName("株式会社オーエムアイ")).not.toBe(
      normalizeCompanyName("シー・ケイ・ケー株式会社"),
    );
  });
});

describe("isOwnCompany", () => {
  it("自社名（表記ゆれ込み）を検出する", () => {
    for (const n of [
      "シー・ケイ・ケー株式会社",
      "株式会社シー・ケイ・ケー",
      "シーケイケー株式会社",
      "ＣＫＫ",
      "CKK Co., Ltd.",
    ]) {
      expect(isOwnCompany(n), n).toBe(true);
    }
  });

  it("顧客名は自社と判定しない", () => {
    expect(isOwnCompany("株式会社オーエムアイ")).toBe(false);
    expect(isOwnCompany("トヨタ自動車株式会社")).toBe(false);
  });

  it("空・null は false", () => {
    expect(isOwnCompany(null)).toBe(false);
    expect(isOwnCompany("")).toBe(false);
    expect(isOwnCompany("   ")).toBe(false);
  });
});
