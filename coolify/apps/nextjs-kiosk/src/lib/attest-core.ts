/**
 * attest-core.ts — 端末アテステーションの純ロジック（署名検証・Cookie 形式）。
 *
 * Android ラッパー（android-kiosk）が Keystore の P-256 鍵で nonce に署名し、
 * サーバーは端末行に束縛済みの公開鍵（SPKI DER base64）で検証する。
 * 検証成功で HMAC 署名の kiosk_attest Cookie（`v2.deviceId.exp.mac`）を発行 —
 * ステートレスで、以後のリクエストは Cookie 検証のみ。
 *
 * MAC の入力には端末行の **fingerprint（束縛済み鍵の SHA-256）** を含める。
 * deviceId と期限だけだと、SY09 で鍵をリセットしても手元の 12h Cookie は
 * そのまま通ってしまい、「鍵を無効にした」が Cookie の寿命ぶん遅れる。
 * fingerprint が変われば（リセット = null / 再束縛 = 別の値）古い Cookie は
 * 落ち、端末は再アテスト（TOFU で再束縛）を踏む。
 *
 * Cookie は先頭にバージョン（`v2`）を持つ。形式を変えたら版を上げること —
 * 旧形式は検証で false になるだけ（再アテストで作り直る）で、例外にはならない。
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

/** Cookie 形式の版。MAC の入力にも含めるので、版が違えば MAC も合わない。 */
const ATTEST_COOKIE_VERSION = "v2";

function macOf(
  secret: string,
  deviceId: string,
  fingerprint: string,
  exp: string,
): string {
  return createHmac("sha256", secret)
    .update(`${ATTEST_COOKIE_VERSION}.${deviceId}.${fingerprint}.${exp}`)
    .digest("base64url");
}

/**
 * kiosk_attest Cookie 値の生成。fingerprint は**いま端末行に束縛されている鍵**
 * のもの（/api/kiosk/attest は TOFU 束縛 or 既存鍵一致の後に呼ぶ）。
 */
export function mintAttestCookie(
  secret: string,
  deviceId: string,
  fingerprint: string,
  now = Date.now(),
): string {
  const exp = String(now + ATTEST_COOKIE_TTL_MS);
  const mac = macOf(secret, deviceId, fingerprint, exp);
  return `${ATTEST_COOKIE_VERSION}.${deviceId}.${exp}.${mac}`;
}

/**
 * kiosk_attest Cookie 値の検証（版・デバイス一致・期限・MAC）。
 * `fingerprint` は端末行の現在値。null（鍵未束縛 / リセット直後）なら
 * 照合できる鍵が無いので常に false — 端末は再アテストへ回る。
 * 旧形式（3 区切り）や別の版は false（例外にしない）。
 */
export function verifyAttestCookie(
  secret: string,
  cookieValue: string,
  deviceId: string,
  fingerprint: string | null,
  now = Date.now(),
): boolean {
  if (!fingerprint) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 4) return false;
  const [version, cookieDevice, exp, mac] = parts;
  if (version !== ATTEST_COOKIE_VERSION) return false;
  if (cookieDevice !== deviceId) return false;
  if (!/^\d+$/.test(exp) || Number(exp) < now) return false;
  const expected = Buffer.from(macOf(secret, deviceId, fingerprint, exp));
  const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
