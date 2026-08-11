/**
 * attest-core.ts — 端末アテステーションの純ロジック（署名検証・Cookie 形式）。
 *
 * Android ラッパー（android-kiosk）が Keystore の P-256 鍵で nonce に署名し、
 * サーバーは端末行に束縛済みの公開鍵（SPKI DER base64）で検証する。
 * 検証成功で HMAC 署名の kiosk_attest Cookie（`deviceId.exp.mac`）を発行 —
 * ステートレスで、以後のリクエストは Cookie 検証のみ。
 *
 * 有効化: 環境変数 KIOSK_ATTESTATION=required（未設定/その他は無効 = ブラウザ可）。
 */

import {
  createHash,
  createHmac,
  createPublicKey,
  createVerify,
  timingSafeEqual,
} from "node:crypto";

export const ATTEST_COOKIE = "kiosk_attest";
export const ATTEST_COOKIE_TTL_MS = 12 * 60 * 60 * 1000; // 12h で再アテスト

export function attestationRequired(): boolean {
  return process.env.KIOSK_ATTESTATION === "required";
}

/** アテステーション用シークレット（専用 env が無ければ WS シークレットを流用）。 */
export function attestSecret(): string | null {
  return process.env.KIOSK_ATTEST_SECRET ?? process.env.KIOSK_WS_SECRET ?? null;
}

/** SPKI DER base64 → SHA-256 hex（端末フィンガープリント）。 */
export function fingerprintOf(publicKeySpkiB64: string): string {
  return createHash("sha256")
    .update(Buffer.from(publicKeySpkiB64, "base64"))
    .digest("hex");
}

/** ECDSA P-256 / SHA-256（DER 署名）検証。鍵・署名が不正形式なら false。 */
export function verifyDeviceSignature(
  publicKeySpkiB64: string,
  payload: string,
  signatureB64: string,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeySpkiB64, "base64"),
      format: "der",
      type: "spki",
    });
    if (key.asymmetricKeyType !== "ec") return false;
    const verifier = createVerify("SHA256");
    verifier.update(payload);
    return verifier.verify(key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

function macOf(secret: string, deviceId: string, exp: string): string {
  return createHmac("sha256", secret)
    .update(`${deviceId}.${exp}`)
    .digest("base64url");
}

/** kiosk_attest Cookie 値の生成。 */
export function mintAttestCookie(
  secret: string,
  deviceId: string,
  now = Date.now(),
): string {
  const exp = String(now + ATTEST_COOKIE_TTL_MS);
  return `${deviceId}.${exp}.${macOf(secret, deviceId, exp)}`;
}

/** kiosk_attest Cookie 値の検証（デバイス一致・期限・MAC）。 */
export function verifyAttestCookie(
  secret: string,
  cookieValue: string,
  deviceId: string,
  now = Date.now(),
): boolean {
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [cookieDevice, exp, mac] = parts;
  if (cookieDevice !== deviceId) return false;
  if (!/^\d+$/.test(exp) || Number(exp) < now) return false;
  const expected = Buffer.from(macOf(secret, deviceId, exp));
  const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
