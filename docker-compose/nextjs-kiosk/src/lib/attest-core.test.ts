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
  it("mint→verify roundtrip", () => {
    const c = mintAttestCookie(secret, dev, 1000);
    expect(verifyAttestCookie(secret, c, dev, 1000)).toBe(true);
  });
  it("期限切れ・別デバイス・改ざん・別シークレットは拒否", () => {
    const c = mintAttestCookie(secret, dev, 1000);
    expect(
      verifyAttestCookie(secret, c, dev, 1000 + ATTEST_COOKIE_TTL_MS + 1),
    ).toBe(false);
    expect(verifyAttestCookie(secret, c, "other-device", 1000)).toBe(false);
    expect(verifyAttestCookie(secret, `${c}x`, dev, 1000)).toBe(false);
    expect(verifyAttestCookie("wrong", c, dev, 1000)).toBe(false);
    expect(verifyAttestCookie(secret, "a.b", dev, 1000)).toBe(false);
  });
});
