/**
 * 文字の大きさは **nextjs-web と同じ段・同じ倍率**でなければならない。
 * 保存先が同じ `app.users.text_scale` なので、片方だけ刻みを変えると
 * **同じ人が Web と端末で違う大きさになる** — しかも設定画面はどちらも
 * 「大」と表示するので、見ただけでは気づけない。
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_SCALE,
  normalizeTextScale,
  TEXT_SCALE_FACTORS,
  TEXT_SCALES,
  textScaleRootCss,
} from "./text-scale";

const WEB_CORE = readFileSync(
  "../nextjs-web/src/lib/user-preferences-core.ts",
  "utf8",
);

/** web 側の定義（配列 / 倍率表）をソースから読む。 */
function webScales(): string[] {
  const m = /export const TEXT_SCALES = \[([^\]]+)\]/.exec(WEB_CORE);
  if (!m) throw new Error("web の TEXT_SCALES が読めません");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function webFactors(): Record<string, number> {
  const m =
    /TEXT_SCALE_FACTORS: Record<TextScale, number> = \{([\s\S]*?)\}/.exec(
      WEB_CORE,
    );
  if (!m) throw new Error("web の TEXT_SCALE_FACTORS が読めません");
  const out: Record<string, number> = {};
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*([\d.]+)/g)) {
    out[k] = Number(v);
  }
  return out;
}

describe("web と段・倍率が一致している", () => {
  it("段の並び", () => {
    expect([...TEXT_SCALES]).toEqual(webScales());
  });

  it("倍率", () => {
    expect(TEXT_SCALE_FACTORS).toEqual(webFactors());
  });
});

describe("normalizeTextScale", () => {
  it("知っている段はそのまま", () => {
    expect(normalizeTextScale("lg")).toBe("lg");
  });

  // DB に古い値・手書きの値が入っていても画面を壊さない
  it("知らない値・空・null は既定へ倒す", () => {
    expect(normalizeTextScale("huge")).toBe(DEFAULT_TEXT_SCALE);
    expect(normalizeTextScale(null)).toBe(DEFAULT_TEXT_SCALE);
    expect(normalizeTextScale(undefined)).toBe(DEFAULT_TEXT_SCALE);
    expect(normalizeTextScale(2)).toBe(DEFAULT_TEXT_SCALE);
  });
});

describe("textScaleRootCss", () => {
  it("倍率を :root へ流す", () => {
    expect(textScaleRootCss("md")).toBe(":root{--app-text-scale:1}");
    expect(textScaleRootCss("xl")).toBe(":root{--app-text-scale:1.25}");
  });

  // <style> の中身は生テキスト。記号が混ざると壊れるので、数値だけであること
  it("記号が混ざらない（数値だけ）", () => {
    for (const s of TEXT_SCALES) {
      expect(textScaleRootCss(s)).toMatch(/^:root\{--app-text-scale:[\d.]+\}$/);
    }
  });
});
