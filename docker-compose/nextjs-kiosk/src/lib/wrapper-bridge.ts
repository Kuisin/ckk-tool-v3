/**
 * wrapper-bridge.ts — Android ラッパー（android-kiosk）の JS ブリッジ。
 *
 * ラッパーの WebView は `window.KioskDevice` を注入する:
 *   getPublicKey(): SPKI DER base64（Keystore P-256、非エクスポート鍵の公開部）
 *   sign(data):     SHA256withECDSA の DER 署名 base64
 * 通常ブラウザには存在しない — 存在チェックが「ラッパー経由か」の判定。
 */

export type KioskBridge = {
  getPublicKey(): string;
  sign(data: string): string;
};

export function getBridge(): KioskBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as { KioskDevice?: KioskBridge }).KioskDevice;
  return bridge && typeof bridge.sign === "function" ? bridge : null;
}

export type AttestOutcome =
  | "OK"
  | "NO_BRIDGE"
  | "KEY_MISMATCH" // 別の鍵が束縛済み — 管理者が SY09 で鍵リセット
  | "FAILED";

/** チャレンジ取得 → ブリッジ署名 → 検証 POST（成功で attest Cookie が付く）。 */
export async function runAttestation(): Promise<AttestOutcome> {
  const bridge = getBridge();
  if (!bridge) return "NO_BRIDGE";
  try {
    const challengeRes = await fetch("/api/kiosk/attest");
    if (!challengeRes.ok) return "FAILED";
    const { nonce } = (await challengeRes.json()) as { nonce: string };
    const publicKey = bridge.getPublicKey();
    const signature = bridge.sign(nonce);
    const res = await fetch("/api/kiosk/attest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce, publicKey, signature }),
    });
    if (res.ok) return "OK";
    const data = (await res.json().catch(() => null)) as {
      state?: string;
    } | null;
    return data?.state === "KEY_MISMATCH" || data?.state === "KEY_IN_USE"
      ? "KEY_MISMATCH"
      : "FAILED";
  } catch {
    return "FAILED";
  }
}
