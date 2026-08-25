/**
 * device-signals-core.test.ts — 端末シグネチャの不変条件。
 *
 * ここが守るもの:
 *  - **揮発値（画面サイズ・UA バージョン等）ではシグネチャが動かない**こと。
 *    ここが崩れると、外部モニタを挿しただけで「初めて見る端末」になり、
 *    端末台帳が丸ごと無意味になる。
 *  - 逆に安定値が 1 つでも変わればシグネチャが動くこと。
 *  - キー順・欠損表現（undefined / null / "" / キー無し）でブレないこと。
 *  - 値に区切り制御文字を混ぜてもキーを詐称できないこと。
 *  - 壊れた入力で例外を投げないこと（ログイン経路から呼ばれるため）。
 *  - ゴールデンベクタ — **版を上げるとき以外、この hex は変わってはいけない**。
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalSignalString,
  deviceLabelFrom,
  fingerprintOfSignals,
  normalizeSignals,
  SIGNALS_VERSION,
  STABLE_KEYS,
} from "./device-signals-core";

const digest = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");

const fp = (raw: unknown): string =>
  fingerprintOfSignals(raw, digest).fingerprint;

/** 代表的な社給 PC 相当のシグネチャ。 */
const BASE = {
  platform: "Win32",
  uaFamily: "Chrome",
  osFamily: "Windows",
  osMajor: "11",
  cpuCores: 8,
  deviceMemoryGb: 8,
  timeZone: "Asia/Tokyo",
  languages: ["ja-JP", "ja", "en-US"],
  touchPoints: 0,
  webglVendor: "Google Inc. (Intel)",
  webglRenderer: "ANGLE (Intel, Intel(R) UHD Graphics 770, D3D11)",
  fontProbe: "1,0,1,1,0,0,1,1,0,1,0,1",
  canvasData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
} as const;

describe("fingerprintOfSignals", () => {
  it("同じ入力からは同じ 64 桁 hex", () => {
    const a = fp(BASE);
    const b = fp({ ...BASE });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("キーの挿入順に依存しない", () => {
    const reversed = Object.fromEntries(Object.entries(BASE).reverse());
    expect(fp(reversed)).toBe(fp(BASE));
  });

  it("揮発値だけ変えてもシグネチャは動かない（この設計の肝）", () => {
    const volatileChanges = [
      { uaFull: "Mozilla/5.0 … Chrome/141.0.0.0" },
      { uaFull: "Mozilla/5.0 … Chrome/142.0.0.0" },
      { screen: "2560x1440x30@2" },
      { screen: "1920x1080x24@1" },
      { viewport: "1440x900" },
      { tzOffsetMin: 540 },
      { clientNowMs: 1_700_000_000_000 },
      { webdriver: true },
      { cookieEnabled: false },
      { pdfViewer: true },
      { collectMs: 123 },
      { wrapperVersion: "0.6.0" },
    ];
    for (const change of volatileChanges) {
      expect(fp({ ...BASE, ...change })).toBe(fp(BASE));
    }
  });

  it("安定値はどれを変えてもシグネチャが動く", () => {
    const baseline = fp(BASE);
    const changes: Record<string, unknown> = {
      platform: "MacIntel",
      uaFamily: "Firefox",
      osFamily: "macOS",
      osMajor: "15",
      cpuCores: 16,
      deviceMemoryGb: 16,
      timeZone: "America/New_York",
      languages: ["en-US"],
      touchPoints: 5,
      webglVendor: "Apple",
      webglRenderer: "Apple M3",
      fontProbe: "0,0,0,0,0,0,0,0,0,0,0,0",
      canvasData: "data:image/png;base64,ZZZZ",
    };
    // canvasDigest は canvasData 由来なので、入力側のキー名で回す
    for (const [key, value] of Object.entries(changes)) {
      expect(fp({ ...BASE, [key]: value })).not.toBe(baseline);
    }
    // STABLE_KEYS を増やしたのにテストを足し忘れた、を検出する
    expect(STABLE_KEYS.length).toBe(Object.keys(changes).length);
  });

  it("undefined / null / 空文字 / キー欠損はすべて同値", () => {
    const withUndefined = { ...BASE, webglVendor: undefined };
    const withNull = { ...BASE, webglVendor: null };
    const withEmpty = { ...BASE, webglVendor: "" };
    const withSpaces = { ...BASE, webglVendor: "   " };
    const { webglVendor: _omitted, ...withoutKey } = BASE;
    const expected = fp(withoutKey);
    expect(fp(withUndefined)).toBe(expected);
    expect(fp(withNull)).toBe(expected);
    expect(fp(withEmpty)).toBe(expected);
    expect(fp(withSpaces)).toBe(expected);
  });

  it("未知のプロパティは無視する（前方互換）", () => {
    expect(fp({ ...BASE, somethingNew: "future", another: 42 })).toBe(fp(BASE));
  });

  it("値に区切り制御文字を混ぜてもキーを詐称できない", () => {
    const injected = fp({
      platform: "a\u001fuaFamily\u001db",
      uaFamily: null,
    });
    const honest = fp({ platform: "a", uaFamily: "b" });
    expect(injected).not.toBe(honest);
  });

  it("巨大な canvasData でも例外なく完了する", () => {
    const huge = "x".repeat(10_000_000);
    expect(fp({ ...BASE, canvasData: huge })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("版が正規形に入っている", () => {
    const canonical = canonicalSignalString(normalizeSignals(BASE, digest));
    expect(canonical.startsWith(`v${SIGNALS_VERSION}`)).toBe(true);
  });

  it("ゴールデンベクタ（版を上げるとき以外、変えてはいけない）", () => {
    expect(fp(BASE)).toBe(
      "3a9a2bde0ee11fb4cacc3073ab6167767f392f06f6ba23455d18c9752fcdea67",
    );
  });
});

describe("normalizeSignals", () => {
  it("壊れた入力でも例外を投げない", () => {
    for (const bad of [null, undefined, 42, "string", [], true]) {
      expect(() => normalizeSignals(bad, digest)).not.toThrow();
      expect(normalizeSignals(bad, digest).platform).toBeNull();
    }
  });

  it("digest が投げても canvasDigest を null にして続行する", () => {
    const throwing = () => {
      throw new Error("boom");
    };
    // canvasData 以外は正規化され、canvasDigest だけ null になる
    const n = normalizeSignals(BASE, (input) =>
      input.startsWith("data:") ? throwing() : digest(input),
    );
    expect(n.canvasDigest).toBeNull();
    expect(n.platform).toBe("Win32");
  });

  it("範囲外の数値は落とす", () => {
    const n = normalizeSignals(
      { cpuCores: -1, deviceMemoryGb: 99999, touchPoints: 3.4 },
      digest,
    );
    expect(n.cpuCores).toBeNull();
    expect(n.deviceMemoryGb).toBeNull();
    expect(n.touchPoints).toBe(3);
  });

  it("languages は順序を保ち、重複だけ落とす", () => {
    const n = normalizeSignals(
      { languages: ["ja-JP", "JA-jp", "en-US", "ja"] },
      digest,
    );
    expect(n.languages).toEqual(["ja-jp", "en-us", "ja"]);
  });

  it("languages が配列でなければ null", () => {
    expect(normalizeSignals({ languages: "ja" }, digest).languages).toBeNull();
  });
});

describe("deviceLabelFrom", () => {
  it("代表パターン", () => {
    const label = (raw: unknown) =>
      deviceLabelFrom(normalizeSignals(raw, digest));
    expect(label(BASE)).toBe("Chrome / Windows 11");
    expect(label({ uaFamily: "Safari", osFamily: "macOS" })).toBe(
      "Safari / macOS",
    );
    expect(label({ uaFamily: "Android WebView" })).toBe("Android WebView");
    expect(label({ osFamily: "iPadOS", osMajor: "18" })).toBe("iPadOS 18");
    expect(label({})).toBe("不明な端末");
  });
});
