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
  isValidTimeZone,
  normalizePreferences,
} from "./user-preferences-core";

describe("normalizePreferences", () => {
  it("有効な値はそのまま通す", () => {
    expect(
      normalizePreferences({
        locale: "en",
        dateFormat: "DD/MM/YYYY",
        timeFormat: "12h",
        timeZone: "Europe/London",
      }),
    ).toEqual({
      locale: "en",
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12h",
      timeZone: "Europe/London",
    });
  });

  it("不正値・null は項目ごとに既定へ倒す", () => {
    expect(
      normalizePreferences({
        locale: "fr",
        dateFormat: "YYYY年MM月",
        timeFormat: "36h",
        timeZone: "Mars/Olympus",
      }),
    ).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES);
    expect(
      normalizePreferences({
        locale: null,
        dateFormat: null,
        timeFormat: null,
        timeZone: null,
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
    });
  });

  it("既定は従来の挙動（日本語 / JST / yyyy/MM/dd / 24h）", () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      locale: "ja",
      dateFormat: "YYYY/MM/DD",
      timeFormat: "24h",
      timeZone: "Asia/Tokyo",
    });
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
      expect(empties(messages), locale).toEqual([]);
    }
  });

  it("対応言語ぶんの辞書が揃っている", () => {
    expect(LOCALES).toEqual(["ja", "en", "zh"]);
  });
});
