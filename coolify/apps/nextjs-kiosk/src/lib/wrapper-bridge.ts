/**
 * wrapper-bridge.ts — Android ラッパー（android-kiosk）の JS ブリッジ。
 *
 * ラッパーの WebView は `window.KioskDevice` を注入する:
 *   getPublicKey():      SPKI DER base64（Keystore P-256、非エクスポート鍵の公開部）
 *   sign(data):          SHA256withECDSA の DER 署名 base64
 *   deviceProfile(nonce): 署名済み端末プロファイル（v0.6.0+）
 * 通常ブラウザには存在しない — 存在チェックが「ラッパー経由か」の判定。
 *
 * deviceProfile は**任意**にしてある。旧 APK が現場に残っている間、
 * サーバーは nonce だけの署名も受け付ける（先にサーバーを出して、端末は
 * SelfUpdater で順に上げる、という順序を成立させるため）。
 */

export type KioskBridge = {
  getPublicKey(): string;
  sign(data: string): string;
  /** ラッパー APK のバージョン（KioskBridge.appVersion — 表示用）。 */
  appVersion?: () => string;
  /**
   * 署名済み端末プロファイル（v0.6.0+）。戻り値は JSON 文字列:
   *   {"profile":"<正規形 JSON>","signature":"<base64>"}
   * 署名対象は `nonce\nprofileJson`（サーバー側 attestPayload と同一）。
   */
  deviceProfile?: (nonce: string) => string;
};

export function getBridge(): KioskBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as { KioskDevice?: KioskBridge }).KioskDevice;
  return bridge && typeof bridge.sign === "function" ? bridge : null;
}

/**
 * 専用アプリ（ラッパー）のバージョン。ブラウザ利用時は null。
 * `unknownLabel` は取得に失敗したときの表示文字列（既定は ja）— 呼び出し側
 * の画面が自分の辞書（例: m.common.unknown）を渡す。
 */
// i18n-ignore — 既定値の "不明" は ja（実際の画面は unknownLabel を渡す）
export function getWrapperVersion(unknownLabel = "不明"): string | null {
  const bridge = getBridge();
  if (!bridge) return null;
  try {
    return bridge.appVersion?.() ?? unknownLabel;
  } catch {
    return unknownLabel;
  }
}

/** ブリッジから署名済みプロファイルを取る。旧 APK・失敗時は null。 */
function signedProfile(
  bridge: KioskBridge,
  nonce: string,
): { profile: string; signature: string } | null {
  if (typeof bridge.deviceProfile !== "function") return null;
  try {
    const parsed = JSON.parse(bridge.deviceProfile(nonce)) as {
      profile?: unknown;
      signature?: unknown;
    };
    if (
      typeof parsed?.profile === "string" &&
      typeof parsed?.signature === "string"
    ) {
      return { profile: parsed.profile, signature: parsed.signature };
    }
  } catch {
    // 取れなければ nonce だけの署名にフォールバックする
  }
  return null;
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

    // v0.6.0+ は端末プロファイルごと署名する。旧 APK は nonce だけ。
    let profile: string | undefined;
    let signature: string;
    const envelope = signedProfile(bridge, nonce);
    if (envelope) {
      profile = envelope.profile;
      signature = envelope.signature;
    } else {
      signature = bridge.sign(nonce);
    }

    const res = await fetch("/api/kiosk/attest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce, publicKey, signature, profile }),
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
