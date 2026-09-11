/**
 * 3 言語の辞書が同じ形をしていること。
 *
 * **型では守れない。** index.ts は `KioskMessages = typeof ja` として en / zh を
 * `as KioskMessages` でキャストしているので、TypeScript は欠けたキーを見ない。
 * キオスク専用の CI ジョブにも nextjs-web 側の i18n ゲート（verify-keys.mjs 等）は
 * 無い。つまり zh.json からキーが 1 つ落ちても**何も落ちず**、中国語の作業者の
 * 画面にだけ `undefined` と表示される。それを止めるのがこの試験。
 *
 * 空文字も弾く — 「キーはあるが訳がまだ」を黙って通すと、画面が無言になる。
 */

import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import ja from "./messages/ja.json";
import zh from "./messages/zh.json";

type Json = { [k: string]: string | Json };

/** 葉までのキー路（"steps.location.invalidQr"）を集める。 */
function leafPaths(obj: Json, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix === "" ? k : `${prefix}.${k}`;
    if (typeof v === "string") out.push(path);
    else out.push(...leafPaths(v, path));
  }
  return out.sort();
}

/** 空文字・空白だけの葉を集める。 */
function blankPaths(obj: Json, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix === "" ? k : `${prefix}.${k}`;
    if (typeof v === "string") {
      if (v.trim() === "") out.push(path);
    } else out.push(...blankPaths(v, path));
  }
  return out.sort();
}

const dicts: [string, Json][] = [
  ["en", en as unknown as Json],
  ["zh", zh as unknown as Json],
];
const jaPaths = leafPaths(ja as unknown as Json);

describe("辞書の 3 言語パリティ", () => {
  it("ja に葉がある（土台の確認）", () => {
    expect(jaPaths.length).toBeGreaterThan(100);
  });

  for (const [name, dict] of dicts) {
    it(`${name} は ja と同じキー集合を持つ`, () => {
      const paths = leafPaths(dict);
      // 差分をそのまま出す — 落ちたときにどのキーか一目で分かるように
      const missing = jaPaths.filter((p) => !paths.includes(p));
      const extra = paths.filter((p) => !jaPaths.includes(p));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it(`${name} に空の訳が無い`, () => {
      expect(blankPaths(dict)).toEqual([]);
    });
  }

  it("ja にも空の訳が無い", () => {
    expect(blankPaths(ja as unknown as Json)).toEqual([]);
  });
});
