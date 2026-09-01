/**
 * 画面ごとの Cookie 名。
 *
 * **1 枚目の名前は変えてはいけない。** 変えると、すでに登録済みの画面が
 * すべてログアウトし、現場を回って登録し直すことになる（壁のテレビなので
 * 脚立が要る）。試験で固定しておく。
 */

import { describe, expect, it } from "vitest";
import { displayCookieName } from "./display-core";

describe("displayCookieName", () => {
  it("1 枚目・指定なしは従来どおりの名前（既存の登録を切らない）", () => {
    expect(displayCookieName(null)).toBe("ckk_display");
    expect(displayCookieName(1)).toBe("ckk_display");
  });

  it("2 枚目以降は画面ごとに分ける（同じブラウザで別々に登録できる）", () => {
    expect(displayCookieName(2)).toBe("ckk_display_2");
    expect(displayCookieName(3)).toBe("ckk_display_3");
  });

  it("画面ごとに必ず違う名前になる", () => {
    const names = [null, 1, 2, 3, 4].map(displayCookieName);
    // 1 枚目と指定なしは同じ（同じ画面を指すため）。それ以外は全部違う
    expect(new Set(names).size).toBe(4);
  });

  // 0 以下は正規化で弾かれて null になる想定だが、素通しでも 1 枚目に倒す
  it("0 以下は 1 枚目として扱う（別名を作らない）", () => {
    expect(displayCookieName(0)).toBe("ckk_display");
    expect(displayCookieName(-1)).toBe("ckk_display");
  });
});
