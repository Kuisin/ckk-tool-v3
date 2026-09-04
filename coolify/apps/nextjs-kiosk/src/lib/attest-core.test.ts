import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ATTEST_COOKIE_TTL_MS,
  fingerprintOf,
  mintAttestCookie,
  verifyAttestCookie,
  verifyDeviceSignature,
} from "./attest-core";

function makeKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const spkiB64 = publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  return { spkiB64, privateKey };
}

describe("verifyDeviceSignature (ECDSA P-256 / SHA-256, DER)", () => {
  it("正しい署名を受理する", () => {
    const { spkiB64, privateKey } = makeKeyPair();
    const signer = createSign("SHA256");
    signer.update("nonce-123");
    const sig = signer.sign(privateKey).toString("base64");
    expect(verifyDeviceSignature(spkiB64, "nonce-123", sig)).toBe(true);
  });
  it("別ペイロード・別鍵・壊れた入力は拒否", () => {
    const a = makeKeyPair();
    const b = makeKeyPair();
    const signer = createSign("SHA256");
    signer.update("nonce-123");
    const sig = signer.sign(a.privateKey).toString("base64");
    expect(verifyDeviceSignature(a.spkiB64, "nonce-999", sig)).toBe(false);
    expect(verifyDeviceSignature(b.spkiB64, "nonce-123", sig)).toBe(false);
    expect(verifyDeviceSignature("not-base64!!", "nonce-123", sig)).toBe(false);
    expect(verifyDeviceSignature(a.spkiB64, "nonce-123", "garbage")).toBe(
      false,
    );
  });
});

describe("fingerprintOf", () => {
  it("64 hex・鍵ごとに一意・決定的", () => {
    const a = makeKeyPair();
    const b = makeKeyPair();
    expect(fingerprintOf(a.spkiB64)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf(a.spkiB64)).toBe(fingerprintOf(a.spkiB64));
    expect(fingerprintOf(a.spkiB64)).not.toBe(fingerprintOf(b.spkiB64));
  });
});

describe("attest cookie", () => {
  const secret = "test-secret";
  const dev = "11111111-2222-3333-4444-555555555555";
  const fp = "a".repeat(64);
  it("mint→verify roundtrip", () => {
    const c = mintAttestCookie(secret, dev, fp, 1000);
    expect(c.startsWith("v2.")).toBe(true);
    expect(verifyAttestCookie(secret, c, dev, fp, 1000)).toBe(true);
  });
  it("期限切れ・別デバイス・改ざん・別シークレットは拒否", () => {
    const c = mintAttestCookie(secret, dev, fp, 1000);
    expect(
      verifyAttestCookie(secret, c, dev, fp, 1000 + ATTEST_COOKIE_TTL_MS + 1),
    ).toBe(false);
    expect(verifyAttestCookie(secret, c, "other-device", fp, 1000)).toBe(false);
    expect(verifyAttestCookie(secret, `${c}x`, dev, fp, 1000)).toBe(false);
    expect(verifyAttestCookie("wrong", c, dev, fp, 1000)).toBe(false);
    expect(verifyAttestCookie(secret, "a.b", dev, fp, 1000)).toBe(false);
  });
  it("鍵リセット（fingerprint が変わる / 消える）で古い Cookie は落ちる", () => {
    const c = mintAttestCookie(secret, dev, fp, 1000);
    // 再束縛で別の鍵になった
    expect(verifyAttestCookie(secret, c, dev, "b".repeat(64), 1000)).toBe(
      false,
    );
    // リセット直後（未束縛）— 照合する鍵が無いので常に false
    expect(verifyAttestCookie(secret, c, dev, null, 1000)).toBe(false);
  });
  it("旧形式（deviceId.exp.mac）や別の版は例外にせず false", () => {
    const exp = String(1000 + ATTEST_COOKIE_TTL_MS);
    expect(verifyAttestCookie(secret, `${dev}.${exp}.mac`, dev, fp, 1000)).toBe(
      false,
    );
    const c = mintAttestCookie(secret, dev, fp, 1000);
    expect(
      verifyAttestCookie(secret, c.replace(/^v2\./, "v1."), dev, fp, 1000),
    ).toBe(false);
    expect(verifyAttestCookie(secret, "", dev, fp, 1000)).toBe(false);
  });
});
