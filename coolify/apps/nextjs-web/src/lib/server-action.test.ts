import { describe, expect, it } from "vitest";
import { localizedInput, localizedInputOrNull } from "./server-action";

describe("localizedInput", () => {
  it("en 省略時は ja をそのまま複製する（後方互換）", () => {
    expect(localizedInput("製品")).toEqual({ ja: "製品", en: "製品" });
  });

  it("en を明示すればそれを使う（従来どおりの 2 引数呼び出し）", () => {
    expect(localizedInput("製品", "Product")).toEqual({
      ja: "製品",
      en: "Product",
    });
  });

  it("nameTranslations（多言語ポップアップ）から en 以外の言語も入る", () => {
    expect(
      localizedInput("製品", undefined, { en: "Product", zh: "产品" }),
    ).toEqual({ ja: "製品", en: "Product", zh: "产品" });
  });

  it("nameTranslations に en が無ければ ja で補完する", () => {
    expect(localizedInput("製品", undefined, { zh: "产品" })).toEqual({
      ja: "製品",
      en: "製品",
      zh: "产品",
    });
  });

  it("空白だけの翻訳は無視する", () => {
    expect(localizedInput("製品", undefined, { en: "  ", zh: "产品" })).toEqual(
      { ja: "製品", en: "製品", zh: "产品" },
    );
  });

  it("前後の空白はトリムする", () => {
    expect(localizedInput("  製品  ")).toEqual({ ja: "製品", en: "製品" });
  });
});

describe("localizedInputOrNull", () => {
  it("ja が空なら null（任意フィールド用）", () => {
    expect(localizedInputOrNull(undefined)).toBeNull();
    expect(localizedInputOrNull("  ")).toBeNull();
  });

  it("ja があれば localizedInput と同じ結果", () => {
    expect(localizedInputOrNull("東京都", undefined, { en: "Tokyo" })).toEqual({
      ja: "東京都",
      en: "Tokyo",
    });
  });
});
