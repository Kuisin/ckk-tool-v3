/**
 * user-preferences-core.test.ts — 表示設定の正規化。
 *
 * 壊れた値（別経路で入った DB 値・古いクライアント）でも画面が落ちず、
 * 項目ごとに既定へ倒れることを確かめる。
 */

import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import zh from "../../messages/zh.json";
import { LOCALES } from "./i18n";
import {
  COMMON_TIME_ZONES,
  DATE_FORMATS,
  DEFAULT_PREFERENCES,
  dateFormatExample,
  displayRootCss,
  FONT_FAMILIES,
  FONT_FAMILY_STACKS,
  isValidTimeZone,
  normalizePreferences,
  TEXT_SCALE_FACTORS,
  TEXT_SCALES,
} from "./user-preferences-core";

describe("normalizePreferences", () => {
  it("有効な値はそのまま通す", () => {
    expect(
      normalizePreferences({
        locale: "en",
        dateFormat: "DD/MM/YYYY",
        timeFormat: "12h",
        timeZone: "Europe/London",
        textScale: "lg",
        boldText: true,
        fontFamily: "system",
      }),
    ).toEqual({
      locale: "en",
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12h",
      timeZone: "Europe/London",
      textScale: "lg",
      boldText: true,
      fontFamily: "system",
    });
  });

  it("不正値・null は項目ごとに既定へ倒す", () => {
    expect(
      normalizePreferences({
        locale: "fr",
        dateFormat: "YYYY年MM月",
        timeFormat: "36h",
        timeZone: "Mars/Olympus",
        textScale: "huge",
        boldText: null,
        fontFamily: "meiryo",
      }),
    ).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES);
    expect(
      normalizePreferences({
        locale: null,
        dateFormat: null,
        timeFormat: null,
        timeZone: null,
        textScale: null,
        boldText: null,
        fontFamily: null,
      }),
    ).toEqual(DEFAULT_PREFERENCES);
  });

  it("一部だけ不正でも、正しい項目は保たれる", () => {
    expect(
      normalizePreferences({
        locale: "zh",
        dateFormat: "bogus",
        timeFormat: "12h",
        timeZone: "Asia/Shanghai",
      }),
    ).toEqual({
      locale: "zh",
      dateFormat: DEFAULT_PREFERENCES.dateFormat,
      timeFormat: "12h",
      timeZone: "Asia/Shanghai",
      textScale: DEFAULT_PREFERENCES.textScale,
      boldText: false,
      fontFamily: DEFAULT_PREFERENCES.fontFamily,
    });
  });

  it("既定は従来の挙動（日本語 / JST / yyyy/MM/dd / 24h / 標準の大きさ / Noto Sans JP）", () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      locale: "ja",
      dateFormat: "YYYY/MM/DD",
      timeFormat: "24h",
      timeZone: "Asia/Tokyo",
      textScale: "md",
      boldText: false,
      fontFamily: "noto",
    });
  });
});

describe("書体", () => {
  it("選択肢は 2 つ（既定 Noto Sans JP / system）で、それぞれスタックを持つ", () => {
    expect(FONT_FAMILIES).toEqual(["noto", "system"]);
    for (const f of FONT_FAMILIES) {
      expect(FONT_FAMILY_STACKS[f].length).toBeGreaterThan(0);
    }
  });

  it("system は Noto Sans JP を強制しない", () => {
    expect(FONT_FAMILY_STACKS.system).not.toContain("Noto Sans JP");
  });
});

describe("文字の大きさ", () => {
  it("段は 5 つで、真ん中が従来の大きさ（倍率 1）", () => {
    expect(TEXT_SCALES).toHaveLength(5);
    expect(TEXT_SCALES[2]).toBe(DEFAULT_PREFERENCES.textScale);
    expect(TEXT_SCALE_FACTORS[DEFAULT_PREFERENCES.textScale]).toBe(1);
  });

  it("小さいほうから大きいほうへ単調に増える", () => {
    const factors = TEXT_SCALES.map((s) => TEXT_SCALE_FACTORS[s]);
    expect(factors).toEqual([...factors].sort((a, b) => a - b));
    expect(new Set(factors).size).toBe(factors.length);
  });
});

describe("displayRootCss", () => {
  it("既定では従来と同じ値（倍率 1・Noto Sans JP・太さ 400/600）を出す", () => {
    expect(displayRootCss(DEFAULT_PREFERENCES)).toBe(
      `:root{--app-text-scale:1;--app-font-family:${FONT_FAMILY_STACKS.noto};--app-font-weight-regular:400;--app-font-weight-medium:600}`,
    );
  });

  it("太字は本文と medium を 1 段ずつ上げる（逆転させない）", () => {
    const css = displayRootCss({ ...DEFAULT_PREFERENCES, boldText: true });
    expect(css).toContain("--app-font-weight-regular:500");
    expect(css).toContain("--app-font-weight-medium:700");
  });

  it("大きさは段の倍率をそのまま渡す", () => {
    expect(
      displayRootCss({ ...DEFAULT_PREFERENCES, textScale: "xl" }),
    ).toContain(`--app-text-scale:${TEXT_SCALE_FACTORS.xl}`);
  });

  it("書体は選んだスタックをそのまま渡す", () => {
    expect(
      displayRootCss({ ...DEFAULT_PREFERENCES, fontFamily: "system" }),
    ).toContain(`--app-font-family:${FONT_FAMILY_STACKS.system}`);
  });

  /**
   * `<style>` の中身は生テキストなので、React にエスケープされる文字が
   * 混ざると CSS ごと壊れる（&gt; がそのまま残る）。値が列挙由来の数値・
   * font-family リストだけであることを、段の全組み合わせで確かめておく。
   * font-family の値は CSS の単一引用符（'）を正当に含む（複数語のフォント名の
   * クォート）ので、`'` は対象外 — 危ないのは HTML/属性エスケープが必要な
   * `<`・`>`・`&`・二重引用符だけ。
   */
  it("エスケープ対象の文字（< > & 二重引用符）を含まない", () => {
    for (const textScale of TEXT_SCALES) {
      for (const boldText of [false, true]) {
        for (const fontFamily of FONT_FAMILIES) {
          const css = displayRootCss({
            ...DEFAULT_PREFERENCES,
            boldText,
            fontFamily,
            textScale,
          });
          expect(css, `${textScale}/${boldText}/${fontFamily}`).not.toMatch(
            /[<>&"]/,
          );
        }
      }
    }
  });
});

describe("isValidTimeZone", () => {
  it("選択肢のタイムゾーンはすべて Intl が解決できる", () => {
    for (const tz of COMMON_TIME_ZONES) {
      expect(isValidTimeZone(tz), tz).toBe(true);
    }
  });

  it("空・不明な名前は弾く", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});

describe("dateFormatExample", () => {
  it("形式ごとに同じ日付の実例を返す（設定画面の選択肢用）", () => {
    expect(DATE_FORMATS.map(dateFormatExample)).toEqual([
      "2026/03/05",
      "2026-03-05",
      "05/03/2026",
      "03/05/2026",
    ]);
  });
});

/**
 * 文言そのものは next-intl（messages/*.json）が持つ。ここでは翻訳漏れ
 * （キーの抜け）だけを見る — ja が正で、en/zh に同じキーが揃っていること。
 */
describe("messages/*.json", () => {
  const keysOf = (o: object): string[] =>
    Object.entries(o)
      .flatMap(([k, v]) =>
        v && typeof v === "object" ? keysOf(v).map((s) => `${k}.${s}`) : [k],
      )
      .sort();

  it("全言語が同じキー構造を持つ（ja が正）", () => {
    const expected = keysOf(ja);
    expect(keysOf(en), "en").toEqual(expected);
    expect(keysOf(zh), "zh").toEqual(expected);
  });

  /**
   * **意図して空にしている鍵**だけの許可リスト。
   *
   * 空文字は本来「まだ訳していない」の印なので既定では落とす。ただし
   * 「その言語では**何も出さないのが正しい**」語が実在する — 「御中」は
   * 日本の商習慣の敬称で、英語・中国語には対応する語が無く、宛名の後ろに
   * 何も付けないのが正しい（`lib/pdf-labels.ts` に元からそう書いてある）。
   *
   * 3 帳票それぞれの名前空間に出てくるのは、どれも共通ラベルを継いでいるため。
   *
   * 足すときは**なぜ空が正しいのか**を必ず書くこと。書けないなら、それは
   * 訳し忘れ。
   */
  const INTENTIONALLY_EMPTY = (key: string) =>
    key.endsWith("pdf.QUOTE.onchu") ||
    key.endsWith("pdf.DELIVERY_NOTE.onchu") ||
    key.endsWith("pdf.INVOICE.onchu");

  it("空文字の翻訳が無い（未翻訳の取りこぼし検出）", () => {
    const empties = (o: object, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object"
          ? empties(v, `${prefix}${k}.`)
          : typeof v === "string" && v.trim() === ""
            ? [`${prefix}${k}`]
            : [],
      );
    for (const [locale, messages] of [
      ["ja", ja],
      ["en", en],
      ["zh", zh],
    ] as const) {
      const found = empties(messages).filter((k) => !INTENTIONALLY_EMPTY(k));
      expect(found, locale).toEqual([]);
    }
  });

  it("対応言語ぶんの辞書が揃っている", () => {
    expect(LOCALES).toEqual(["ja", "en", "zh"]);
  });
});
