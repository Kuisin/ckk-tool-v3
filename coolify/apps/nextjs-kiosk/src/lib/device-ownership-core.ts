/**
 * device-ownership-core.ts — 端末の所有区分（社用 / 私用）の自動判定。
 * 純関数・isomorphic。web と kiosk の双子ファイル。
 *
 * ■ 何を証明できて、何を証明できないか（ここを曖昧にしない）
 *
 * **素のブラウザでは所有を検証できない**。MDM 加入や資産所有を示す
 * navigator API は存在せず、集められる値は全てクライアントの自己申告で
 * 偽装できる。だからこの関数は「社用か否か」を断定せず、**根拠の強さ**を
 * 一緒に返す:
 *
 *   PROVEN         端末が持つ鍵（Android Keystore の非エクスポート鍵）の署名。
 *                  暗号的な証拠。
 *   CIRCUMSTANTIAL 状況証拠。社内 NW にいる / デバイストークンを持っている。
 *                  持ち出しや持ち込みで同じ見え方になる。
 *   NONE           証拠が無い。「私用**かもしれない**」以上のことは言えない。
 *
 * ■ 判定はアクセス制御に使わない
 * SY0D（ログイン履歴）と SY09（端末管理）の表示、および将来のアラート条件
 * のみ。ここを認可に使うと、偽装可能な値で権限が動くことになる。
 *
 * ■ 本当に「社給資産 #1234 である」を証明する道
 * ハードウェア鍵アテステーション（setAttestationChallenge + Google ルートへの
 * 証明書チェーン検証）だけ。既存の TOFU 束縛を壊すので今回は採らず、
 * 別プロジェクトとして残している（README / 計画参照）。
 */

import { ipInAnyCidr } from "./cidr-core";

export type DeviceOwnership =
  | "COMPANY_MANAGED"
  | "COMPANY_NETWORK"
  | "UNMANAGED"
  | "UNKNOWN";

export type OwnershipConfidence = "PROVEN" | "CIRCUMSTANTIAL" | "NONE";

/**
 * **署名検証に成功した**ラッパープロファイル。
 * `signatureVerified: true` をリテラルで要求しているので、検証前の値は
 * 型として classifyDeviceOwnership に渡せない（設計上の安全柵）。
 */
export interface VerifiedWrapperProfile {
  signatureVerified: true;
  isDeviceOwner: boolean;
  isProfileOwner: boolean;
  isManagedProfile: boolean;
  /** dpm.getEnrollmentSpecificId()（API31+ / device owner のみ） */
  enrollmentId: string | null;
  /** "release-keys" | "test-keys" — test-keys は非公式 ROM のサイン */
  buildTags: string | null;
  adbEnabled: boolean | null;
  isEmulator: boolean;
}

export interface OwnershipInput {
  /** 署名検証済みプロファイル。無ければ null */
  wrapper: VerifiedWrapperProfile | null;
  /** 有効なデバイストークンで実在のキオスク端末に解決したか */
  kioskDeviceLinked: boolean;
  /** アテステーション（鍵署名）を通過しているか */
  attested: boolean;
  ip: string | null;
  corporateCidrs: readonly string[];
}

export interface OwnershipVerdict {
  ownership: DeviceOwnership;
  /** 監査文字列（<=40 字）。「なぜそう判定したか」を必ず残す */
  source: string;
  confidence: OwnershipConfidence;
}

/** source 列の上限（VarChar(40)）に合わせる。 */
const MAX_SOURCE_LENGTH = 40;

function verdict(
  ownership: DeviceOwnership,
  source: string,
  confidence: OwnershipConfidence,
): OwnershipVerdict {
  return { ownership, source: source.slice(0, MAX_SOURCE_LENGTH), confidence };
}

/**
 * 所有区分を判定する。**先に一致した規則が勝つ**（上ほど根拠が強い）。
 * 例外を投げない。
 */
export function classifyDeviceOwnership(
  input: Partial<OwnershipInput> | null | undefined,
): OwnershipVerdict {
  const wrapper = input?.wrapper ?? null;
  const linked = input?.kioskDeviceLinked === true;
  const attested = input?.attested === true;
  const ip = typeof input?.ip === "string" ? input.ip : null;
  const cidrs = Array.isArray(input?.corporateCidrs)
    ? input.corporateCidrs
    : [];

  // 1–3: 端末鍵の署名がある = 暗号的な証拠
  if (wrapper?.signatureVerified === true) {
    if (wrapper.isDeviceOwner) {
      return verdict("COMPANY_MANAGED", "wrapper:device-owner", "PROVEN");
    }
    if (wrapper.isProfileOwner || wrapper.isManagedProfile) {
      return verdict("COMPANY_MANAGED", "wrapper:managed", "PROVEN");
    }
    if (linked) {
      // 管理下ではないが、管理者が SY09 で明示的に登録した端末の鍵である
      return verdict("COMPANY_MANAGED", "wrapper:enrolled", "PROVEN");
    }
  }

  // 4: 旧 APK（プロファイル非対応）でも鍵署名は通っている
  if (linked && attested) {
    return verdict("COMPANY_MANAGED", "kiosk:attested", "PROVEN");
  }

  // 5: デバイストークンだけ = bearer 秘密なので、盗難端末でも成立する
  if (linked) {
    return verdict("COMPANY_MANAGED", "kiosk:token", "CIRCUMSTANTIAL");
  }

  // 6–7: 送信元 IP。**社内 NW にいる証拠であって、社給端末の証拠ではない**
  if (ip && cidrs.length > 0) {
    if (ipInAnyCidr(ip, cidrs)) {
      return verdict("COMPANY_NETWORK", "cidr:inside", "CIRCUMSTANTIAL");
    }
    return verdict("UNMANAGED", "cidr:outside", "NONE");
  }

  // 8: 判定材料が無い（CIDR 未設定 / IP 取得不能）
  return verdict("UNKNOWN", "no-evidence", "NONE");
}

/**
 * ラッパープロファイルの危険サイン。SY09 の警告バナー用。
 * 「これがあると社用と判定しない」ではなく、「社用でも注意して見る」印。
 */
export function wrapperRiskFlags(
  wrapper: VerifiedWrapperProfile | null | undefined,
): string[] {
  if (!wrapper) return [];
  const flags: string[] = [];
  if (wrapper.isEmulator) flags.push("EMULATOR");
  if (wrapper.buildTags === "test-keys") flags.push("TEST_KEYS");
  if (wrapper.adbEnabled === true) flags.push("ADB_ENABLED");
  if (!wrapper.isDeviceOwner && !wrapper.isProfileOwner)
    flags.push("NOT_MANAGED");
  return flags;
}
