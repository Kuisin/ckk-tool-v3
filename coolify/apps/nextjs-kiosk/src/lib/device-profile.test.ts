/**
 * device-profile.test.ts — 署名済み端末プロファイルの検証。
 *
 * ここが守るもの（所有区分「社用」の根拠そのもの）:
 *  - 中身を 1 文字でも書き換えたら通らないこと。通ってしまうと、私用端末が
 *    isDeviceOwner:true を名乗って「社用（PROVEN）」に化けられる。
 *  - **別チャレンジで得た署名の貼り替え**を弾くこと（プロファイル内の nonce と
 *    外側の nonce の一致を見る）。
 *  - 別の鍵の署名を通さないこと。
 *  - 署名検証を通る前にプロファイルを parse しないこと（壊れた JSON でも
 *    署名が正しくなければ false であって、例外ではない）。
 *  - signatureVerified: true が、検証を通った経路でしか作られないこと。
 */

import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  attestPayload,
  PROFILE_SCHEMA_VERSION,
  toVerifiedWrapperProfile,
  verifyDeviceProfile,
} from "./device-profile";

function makeKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const spkiB64 = publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  return { spkiB64, privateKey };
}

function sign(
  privateKey: ReturnType<typeof makeKeyPair>["privateKey"],
  payload: string,
) {
  const signer = createSign("SHA256");
  signer.update(payload);
  return signer.sign(privateKey).toString("base64");
}

const NONCE = "nonce-abc-123";

function profileJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: PROFILE_SCHEMA_VERSION,
    nonce: NONCE,
    appVersion: "0.6.0",
    isDeviceOwner: true,
    manufacturer: "Lenovo",
    model: "TB-X606F",
    buildTags: "release-keys",
    adbEnabled: false,
    isEmulator: false,
    sdkInt: 33,
    ...over,
  });
}

describe("verifyDeviceProfile", () => {
  it("正しい署名のプロファイルを受け入れる", () => {
    const { spkiB64, privateKey } = makeKeyPair();
    const profile = profileJson();
    const signature = sign(privateKey, attestPayload(NONCE, profile));
    const result = verifyDeviceProfile(spkiB64, NONCE, { profile, signature });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.isDeviceOwner).toBe(true);
      // 署名対象そのままを残す（後から独立に再検証できる証拠）
      expect(result.payload).toBe(profile);
      expect(result.signature).toBe(signature);
    }
  });

  it("中身を書き換えたら通らない（社用へのなりすまし防止）", () => {
    const { spkiB64, privateKey } = makeKeyPair();
    const honest = profileJson({ isDeviceOwner: false });
    const signature = sign(privateKey, attestPayload(NONCE, honest));
    // 「管理端末です」に書き換えて、正規の署名を貼り付ける
    const tampered = profileJson({ isDeviceOwner: true });
    expect(
      verifyDeviceProfile(spkiB64, NONCE, { profile: tampered, signature }).ok,
    ).toBe(false);
  });

  it("別チャレンジの署名を貼り替えられない", () => {
    const { spkiB64, privateKey } = makeKeyPair();
    // 古い nonce で正しく署名されたプロファイルを、新しい nonce の検証に使う
    const oldProfile = profileJson({ nonce: "old-nonce" });
    const signature = sign(privateKey, attestPayload("old-nonce", oldProfile));
    expect(
      verifyDeviceProfile(spkiB64, "old-nonce", {
        profile: oldProfile,
        signature,
      }).ok,
    ).toBe(true);
    expect(
      verifyDeviceProfile(spkiB64, NONCE, { profile: oldProfile, signature })
        .ok,
    ).toBe(false);
  });

  it("別の鍵の署名は通らない", () => {
    const victim = makeKeyPair();
    const attacker = makeKeyPair();
    const profile = profileJson();
    const signature = sign(attacker.privateKey, attestPayload(NONCE, profile));
    expect(
      verifyDeviceProfile(victim.spkiB64, NONCE, { profile, signature }).ok,
    ).toBe(false);
  });

  it("版が違うプロファイルは受け入れない", () => {
    const { spkiB64, privateKey } = makeKeyPair();
    const profile = profileJson({ v: PROFILE_SCHEMA_VERSION + 1 });
    const signature = sign(privateKey, attestPayload(NONCE, profile));
    expect(verifyDeviceProfile(spkiB64, NONCE, { profile, signature }).ok).toBe(
      false,
    );
  });

  it("壊れた入力でも例外を投げず false を返す", () => {
    const { spkiB64, privateKey } = makeKeyPair();
    const broken = "{not json";
    const signature = sign(privateKey, attestPayload(NONCE, broken));
    // 署名は正しいが JSON として壊れている
    expect(
      verifyDeviceProfile(spkiB64, NONCE, { profile: broken, signature }).ok,
    ).toBe(false);
    for (const bad of [null, undefined, 42, {}, { profile: "x" }]) {
      expect(verifyDeviceProfile(spkiB64, NONCE, bad).ok).toBe(false);
    }
  });

  it("欠損の多い端末（minSdk 29）でも受け入れる", () => {
    const { spkiB64, privateKey } = makeKeyPair();
    // enrollmentId / installer / securityPatch が取れない実機は普通にある
    const profile = JSON.stringify({
      v: PROFILE_SCHEMA_VERSION,
      nonce: NONCE,
      isDeviceOwner: false,
      enrollmentId: null,
      installer: null,
      securityPatch: null,
    });
    const signature = sign(privateKey, attestPayload(NONCE, profile));
    expect(verifyDeviceProfile(spkiB64, NONCE, { profile, signature }).ok).toBe(
      true,
    );
  });
});

describe("toVerifiedWrapperProfile", () => {
  it("欠損は安全側（false / null）に倒す", () => {
    const wrapper = toVerifiedWrapperProfile({
      v: PROFILE_SCHEMA_VERSION,
      nonce: NONCE,
    });
    expect(wrapper).toEqual({
      signatureVerified: true,
      isDeviceOwner: false,
      isProfileOwner: false,
      isManagedProfile: false,
      enrollmentId: null,
      buildTags: null,
      adbEnabled: null,
      isEmulator: false,
    });
  });
});

describe("attestPayload", () => {
  it("プロファイルが無ければ nonce だけ（旧 APK 互換）", () => {
    expect(attestPayload(NONCE, null)).toBe(NONCE);
  });

  it("プロファイルがあれば改行で連結する", () => {
    expect(attestPayload(NONCE, "{}")).toBe(`${NONCE}\n{}`);
  });
});
