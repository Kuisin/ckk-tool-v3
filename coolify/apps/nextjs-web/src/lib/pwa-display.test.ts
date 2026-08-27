import { describe, expect, it } from "vitest";
import { detectStandalone } from "./pwa-display";

const media = (matches: boolean) => ({
  matchMedia: () => ({ matches }),
});

describe("detectStandalone", () => {
  it("普通のブラウザは false", () => {
    expect(detectStandalone(media(false))).toBe(false);
  });

  it("display-mode: standalone なら true（Android など）", () => {
    expect(detectStandalone(media(true))).toBe(true);
  });

  it("iOS はホーム画面追加を navigator.standalone でしか名乗らない", () => {
    // display-mode を報告しない iOS を、これだけで取りこぼさないこと。
    expect(
      detectStandalone({ ...media(false), navigator: { standalone: true } }),
    ).toBe(true);
  });

  it("navigator.standalone が false なら media query を見る", () => {
    expect(
      detectStandalone({ ...media(true), navigator: { standalone: false } }),
    ).toBe(true);
    expect(
      detectStandalone({ ...media(false), navigator: { standalone: false } }),
    ).toBe(false);
  });

  it("matchMedia が無い環境は普通のブラウザ扱い", () => {
    expect(detectStandalone({})).toBe(false);
    expect(detectStandalone(undefined)).toBe(false);
  });

  it("matchMedia が投げても落ちない", () => {
    expect(
      detectStandalone({
        matchMedia: () => {
          throw new Error("unsupported");
        },
      }),
    ).toBe(false);
  });
});
