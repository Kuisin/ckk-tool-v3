/**
 * device-signals.test.ts — 端末シグネチャ Cookie の不変条件。
 *
 * ここが守るもの:
 *  - **改竄した Cookie を受け付けない**こと。受け付けると、攻撃者が既知の
 *    正規端末のシグネチャを名乗って「見慣れた端末」に化けられる。
 *  - 期限切れを受け付けないこと。
 *  - 署名鍵が未設定でも例外にならず、機能が落ちるだけで済むこと
 *    （env 欠けでログイン画面が壊れない）。
 *  - Cookie が 4KB を超えないよう、大きすぎるシグネチャは指紋だけに縮むこと。
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  computeSignals,
  DEVICE_SIGNALS_TTL_MS,
  digest,
  mintSignalsCookie,
  verifySignalsCookie,
} from "./device-signals";
import { normalizeSignals } from "./device-signals-core";

const SECRET = "test-secret-for-device-signals";

beforeEach(() => {
  process.env.DEVICE_SIGNALS_SECRET = SECRET;
});

const SAMPLE = {
  platform: "Win32",
  uaFamily: "Chrome",
  osFamily: "Windows",
  osMajor: "10.0",
  cpuCores: 8,
  timeZone: "Asia/Tokyo",
  languages: ["ja-JP", "ja"],
};

describe("署名 Cookie", () => {
  it("往復できる", () => {
    const { version, fingerprint, normalized } = computeSignals(SAMPLE);
    const cookie = mintSignalsCookie(version, fingerprint, normalized);
    expect(cookie).not.toBeNull();
    const payload = verifySignalsCookie(cookie);
    expect(payload?.fp).toBe(fingerprint);
    expect(payload?.v).toBe(version);
    expect(payload?.s?.platform).toBe("Win32");
  });

  it("本体を差し替えた Cookie は拒否する（なりすまし防止）", () => {
    const mine = computeSignals(SAMPLE);
    const other = computeSignals({ ...SAMPLE, platform: "MacIntel" });
    const cookie = mintSignalsCookie(
      mine.version,
      mine.fingerprint,
      mine.normalized,
    ) as string;
    const [, mac] = cookie.split(".");
    // 別端末の指紋を名乗る本体に、こちらの MAC を貼り付ける
    const forgedBody = Buffer.from(
      JSON.stringify({
        v: other.version,
        fp: other.fingerprint,
        exp: Date.now() + 60_000,
      }),
      "utf8",
    ).toString("base64url");
    expect(verifySignalsCookie(`${forgedBody}.${mac}`)).toBeNull();
  });

  it("MAC を削っても通らない", () => {
    const { version, fingerprint, normalized } = computeSignals(SAMPLE);
    const cookie = mintSignalsCookie(
      version,
      fingerprint,
      normalized,
    ) as string;
    const body = cookie.slice(0, cookie.lastIndexOf("."));
    expect(verifySignalsCookie(body)).toBeNull();
    expect(verifySignalsCookie(`${body}.`)).toBeNull();
    expect(verifySignalsCookie("garbage")).toBeNull();
    expect(verifySignalsCookie(null)).toBeNull();
  });

  it("期限切れは拒否する", () => {
    const { version, fingerprint, normalized } = computeSignals(SAMPLE);
    const cookie = mintSignalsCookie(
      version,
      fingerprint,
      normalized,
      Date.now() - DEVICE_SIGNALS_TTL_MS - 1000,
    ) as string;
    expect(verifySignalsCookie(cookie)).toBeNull();
  });

  it("鍵が無ければ発行も検証もしない（例外は投げない）", () => {
    process.env.DEVICE_SIGNALS_SECRET = "";
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "";
    const { version, fingerprint, normalized } = computeSignals(SAMPLE);
    expect(mintSignalsCookie(version, fingerprint, normalized)).toBeNull();
    expect(verifySignalsCookie("anything.anything")).toBeNull();
    process.env.AUTH_SECRET = original;
  });

  it("大きすぎるシグネチャは指紋だけに縮む（Cookie 4KB 制限）", () => {
    const base = normalizeSignals(SAMPLE, digest);
    // 正規化を通さず直接水増しして、埋め込み上限の分岐を確実に踏ませる
    const bloated = {
      ...base,
      webglRenderer: "y".repeat(4000),
    };
    const cookie = mintSignalsCookie(1, "a".repeat(64), bloated) as string;
    expect(cookie.length).toBeLessThan(4096);
    const payload = verifySignalsCookie(cookie);
    expect(payload?.fp).toBe("a".repeat(64));
    // 本体は落ちるが、指紋は運ばれるので相関は維持できる
    expect(payload?.s).toBeUndefined();
  });
});
