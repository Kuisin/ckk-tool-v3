/**
 * device-profile-core.ts — 署名済み端末プロファイルの表示用の形。純関数。
 *
 * **server-only にしない**のが要点。SY09 の端末情報パネルはクライアント
 * コンポーネントで、そこから `deviceRiskFlags` を呼ぶ。これを
 * `kiosk-admin.ts`（server-only + Prisma）に置くと、クライアント側の
 * バンドルが Prisma を掴もうとして画面ごと 500 になる
 * （アプリの CLAUDE.md「Conventions that bite」の RSC boundary）。
 *
 * 検証そのものはキオスク側（nextjs-kiosk/src/lib/device-profile.ts）の仕事。
 * ここは検証済みの JSON を画面に出せる形へ畳むだけ。
 */

import type { Tr } from "./i18n";

/** SY09 に出す項目だけ。端末同定用の値（androidId / serial）は載せない。 */
export interface DeviceProfileSummary {
  manufacturer: string | null;
  model: string | null;
  sdkInt: number | null;
  securityPatch: string | null;
  appVersion: string | null;
  installer: string | null;
  isDeviceOwner: boolean;
  isProfileOwner: boolean;
  lockTaskState: number | null;
  enrollmentId: string | null;
  buildTags: string | null;
  adbEnabled: boolean | null;
  developmentSettings: boolean | null;
  isEmulator: boolean;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** DB の JSON から表示用サマリへ。壊れていれば null（例外は投げない）。 */
export function toProfileSummary(value: unknown): DeviceProfileSummary | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  return {
    manufacturer: str(p.manufacturer),
    model: str(p.model),
    sdkInt: num(p.sdkInt),
    securityPatch: str(p.securityPatch),
    appVersion: str(p.appVersion),
    installer: str(p.installer),
    isDeviceOwner: p.isDeviceOwner === true,
    isProfileOwner: p.isProfileOwner === true,
    lockTaskState: num(p.lockTaskState),
    enrollmentId: str(p.enrollmentId),
    buildTags: str(p.buildTags),
    adbEnabled: boolOrNull(p.adbEnabled),
    developmentSettings: boolOrNull(p.developmentSettings),
    isEmulator: p.isEmulator === true,
  };
}

/**
 * 端末プロファイルの危険サイン（SY09 の警告バナー）。
 * 「社用と判定しない」ではなく「社用でも注意して見る」印。
 */
export function deviceRiskFlags(
  profile: DeviceProfileSummary | null,
  tr: Tr,
): string[] {
  if (!profile) return [];
  const flags: string[] = [];
  if (profile.isEmulator) {
    flags.push(tr("settings.deviceProfileCore.suspectedEmulator"));
  }
  if (profile.buildTags === "test-keys") {
    flags.push(tr("settings.deviceProfileCore.suspectedUnofficialRom"));
  }
  if (profile.adbEnabled === true) {
    flags.push(tr("settings.deviceProfileCore.usbDebuggingEnabled"));
  }
  if (profile.developmentSettings === true) {
    flags.push(tr("settings.deviceProfileCore.developerOptionsEnabled"));
  }
  if (!profile.isDeviceOwner && !profile.isProfileOwner) {
    flags.push(tr("settings.deviceProfileCore.notRegisteredAsManagedDevice"));
  }
  return flags;
}
