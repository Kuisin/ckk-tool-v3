/**
 * device-profile.ts — Android ラッパーが署名して送る端末プロファイル。
 *
 * ラッパー（KioskBridge.deviceProfile(nonce)）が、TOFU 束縛済みの Keystore 鍵で
 * `nonce\nprofileJson` に署名して返す。サーバーは**署名を検証してから**
 * profileJson を parse する（順序が逆だと、未検証の JSON をパースする穴になる）。
 *
 * ■ 何が保証されるか
 * 鍵は端末の非エクスポート Keystore にあるので、プロファイルを 1 文字でも
 * 書き換えれば署名が壊れる = **その端末が申告した内容である**ことは保証できる。
 *
 * ■ 何が保証されないか
 * root 化した端末が「本物の鍵で嘘の値に署名する」ことは防げない。そこを塞ぐのは
 * ハードウェア鍵アテステーション（setAttestationChallenge + Google ルートへの
 * チェーン検証）だけで、既存の TOFU 束縛を作り直すことになるため今回は採らない。
 *
 * ■ nonce の二重確認
 * プロファイル内にも nonce を入れさせ、外側の nonce と一致することを見る。
 * 別チャレンジで得た署名済みプロファイルの貼り替えを防ぐ。
 */

// server-only は付けない — attest-core.ts と同じく DB も Cookie も触らない
// 純粋な検証ロジックで、そのままユニットテストから呼びたいため。
import { z } from "zod";
import { verifyDeviceSignature } from "@/lib/attest-core";
import type { VerifiedWrapperProfile } from "@/lib/device-ownership-core";

/** プロファイルの版。ラッパー側 KioskBridge と合わせる。 */
export const PROFILE_SCHEMA_VERSION = 1;

/** 署名対象文字列の**唯一の定義**。ラッパー側と 1 文字も違ってはいけない。 */
export function attestPayload(
  nonce: string,
  profileJson: string | null,
): string {
  return profileJson === null ? nonce : `${nonce}\n${profileJson}`;
}

/**
 * 端末プロファイルのスキーマ。**すべて任意**にしてあるのは、minSdk 29 では
 * enrollmentId（API31+）や installer（API30+）が普通に取れないため。
 * サーバー側は null 前提で書くこと。
 */
export const deviceProfileSchema = z.object({
  v: z.number().int(),
  nonce: z.string().min(1),
  signedAt: z.number().int().optional(),

  appVersion: z.string().max(32).optional(),
  appVersionCode: z.number().int().optional(),
  packageName: z.string().max(128).optional(),
  installer: z.string().max(128).nullable().optional(),

  // 管理状態（所有区分の判定材料）
  isDeviceOwner: z.boolean().optional(),
  isProfileOwner: z.boolean().optional(),
  isManagedProfile: z.boolean().optional(),
  activeAdmins: z.number().int().optional(),
  lockTaskState: z.number().int().optional(),
  /** dpm.getEnrollmentSpecificId() — 組織×端末×アプリで一意・初期化しても不変 */
  enrollmentId: z.string().max(128).nullable().optional(),

  // 端末同定
  androidId: z.string().max(64).nullable().optional(),
  serial: z.string().max(64).nullable().optional(),

  // Build
  manufacturer: z.string().max(64).optional(),
  model: z.string().max(64).optional(),
  device: z.string().max(64).optional(),
  brand: z.string().max(64).optional(),
  hardware: z.string().max(64).optional(),
  buildFingerprint: z.string().max(200).optional(),
  buildId: z.string().max(64).optional(),
  /** "release-keys" | "test-keys" — test-keys は非公式 ROM のサイン */
  buildTags: z.string().max(64).nullable().optional(),
  buildType: z.string().max(32).optional(),

  // OS / リスク
  sdkInt: z.number().int().optional(),
  securityPatch: z.string().max(32).nullable().optional(),
  isDeviceSecure: z.boolean().optional(),
  adbEnabled: z.boolean().nullable().optional(),
  developmentSettings: z.boolean().nullable().optional(),
  isEmulator: z.boolean().optional(),

  // 環境
  timeZone: z.string().max(64).optional(),
  locale: z.string().max(32).optional(),
});

export type DeviceProfile = z.infer<typeof deviceProfileSchema>;

/** ラッパーが返す JSON: { profile: "<json 文字列>", signature: "<base64>" }。 */
const envelopeSchema = z.object({
  profile: z.string().min(2).max(4000),
  signature: z.string().min(1).max(400),
});

export type ProfileVerdict =
  | { ok: true; profile: DeviceProfile; payload: string; signature: string }
  | { ok: false };

/**
 * 署名済みプロファイルを検証する。
 *
 * 順序が重要: **署名検証 → parse → nonce 照合**。未検証の JSON を先に
 * parse しない。
 */
export function verifyDeviceProfile(
  publicKeySpkiB64: string,
  nonce: string,
  envelope: unknown,
): ProfileVerdict {
  const parsedEnvelope = envelopeSchema.safeParse(envelope);
  if (!parsedEnvelope.success) return { ok: false };
  const { profile: profileJson, signature } = parsedEnvelope.data;

  if (
    !verifyDeviceSignature(
      publicKeySpkiB64,
      attestPayload(nonce, profileJson),
      signature,
    )
  ) {
    return { ok: false };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(profileJson);
  } catch {
    return { ok: false };
  }
  const parsed = deviceProfileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  // 別チャレンジで得た署名の貼り替えを防ぐ
  if (parsed.data.nonce !== nonce) return { ok: false };
  if (parsed.data.v !== PROFILE_SCHEMA_VERSION) return { ok: false };

  return {
    ok: true,
    profile: parsed.data,
    payload: profileJson,
    signature,
  };
}

/**
 * 検証済みプロファイル → 所有区分の判定材料。
 * `signatureVerified: true` は**検証を通ったここでしか作らない**
 * （型の上で、未検証のプロファイルが判定器に届かないようにするため）。
 */
export function toVerifiedWrapperProfile(
  profile: DeviceProfile,
): VerifiedWrapperProfile {
  return {
    signatureVerified: true,
    isDeviceOwner: profile.isDeviceOwner === true,
    isProfileOwner: profile.isProfileOwner === true,
    isManagedProfile: profile.isManagedProfile === true,
    enrollmentId: profile.enrollmentId ?? null,
    buildTags: profile.buildTags ?? null,
    adbEnabled: profile.adbEnabled ?? null,
    isEmulator: profile.isEmulator === true,
  };
}
