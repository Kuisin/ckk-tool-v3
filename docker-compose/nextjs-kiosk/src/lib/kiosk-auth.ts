/**
 * kiosk-auth.ts — キオスク認証のコア（Cookie + DB セッション）。server-only.
 *
 * 2 つの独立した信頼（詳細は shared-db/prisma/schema/kiosk.prisma）:
 *   kiosk_device Cookie  ←→ kiosk_devices.device_token_hash（30日）
 *   kiosk_session Cookie ←→ kiosk_sessions.id（8h ハード + 5分アイドル）
 * Cookie にはトークン生値（256bit ランダム）、DB には SHA-256 のみ保存。
 */

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  ATTEST_COOKIE,
  attestationRequired,
  attestSecret,
  verifyAttestCookie,
} from "./attest-core";
import { prisma } from "./db";
import {
  DEVICE_TOKEN_TTL_MS,
  isDeviceTokenAlive,
  isSessionAlive,
  SESSION_TTL_MS,
} from "./kiosk-auth-core";
import { wsBridge } from "./ws-bridge";

export const DEVICE_COOKIE = "kiosk_device";
export const SESSION_COOKIE = "kiosk_session";

export function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function mintToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256hex(raw) };
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

// ─── 端末（デバイストラスト） ────────────────────────────────────────────────

export type DeviceAuth = {
  id: string;
  name: string | null;
  factoryId: number | null;
  status: "PENDING" | "ACTIVE" | "DISABLED" | "REVOKED";
};

/** 30日デバイストークンを発行し Cookie に設定、ハッシュを返す。 */
export async function setDeviceCookie(): Promise<{
  hash: string;
  expiresAt: Date;
}> {
  const { raw, hash } = mintToken();
  const store = await cookies();
  store.set(DEVICE_COOKIE, raw, cookieOptions(DEVICE_TOKEN_TTL_MS));
  return { hash, expiresAt: new Date(Date.now() + DEVICE_TOKEN_TTL_MS) };
}

/**
 * Cookie から信頼済み端末を解決。ACTIVE + トークン期限内のみ返す。
 * DISABLED/REVOKED は `status` 付きで区別（エラー画面の出し分け用）。
 */
export type DeviceAuthFailReason =
  | "NO_COOKIE"
  | "NOT_FOUND"
  | "EXPIRED"
  | "DISABLED"
  | "REVOKED"
  | "ATTEST_REQUIRED"; // KIOSK_ATTESTATION=required で有効な attest Cookie が無い

/**
 * Cookie から信頼済み端末を解決。KIOSK_ATTESTATION=required のときは
 * Android ラッパーのアテステーション Cookie（attest-core.ts）も要求する。
 * 登録・アテステーションのフロー自身は `skipAttest: true` で呼ぶ。
 */
export async function getDevice(
  opts: { skipAttest?: boolean } = {},
): Promise<
  { ok: true; device: DeviceAuth } | { ok: false; reason: DeviceAuthFailReason }
> {
  const store = await cookies();
  const raw = store.get(DEVICE_COOKIE)?.value;
  if (!raw) return { ok: false, reason: "NO_COOKIE" };

  const device = await prisma.kioskDevice.findUnique({
    where: { deviceTokenHash: sha256hex(raw) },
    select: {
      id: true,
      name: true,
      factoryId: true,
      status: true,
      deviceTokenExpiresAt: true,
    },
  });
  if (!device) return { ok: false, reason: "NOT_FOUND" };
  if (device.status === "DISABLED") return { ok: false, reason: "DISABLED" };
  if (device.status !== "ACTIVE") return { ok: false, reason: "REVOKED" };
  if (!isDeviceTokenAlive(new Date(), device.deviceTokenExpiresAt)) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (!opts.skipAttest && attestationRequired()) {
    const secret = attestSecret();
    const attest = store.get(ATTEST_COOKIE)?.value;
    if (!secret || !attest || !verifyAttestCookie(secret, attest, device.id)) {
      return { ok: false, reason: "ATTEST_REQUIRED" };
    }
  }
  return {
    ok: true,
    device: {
      id: device.id,
      name: device.name,
      factoryId: device.factoryId,
      status: device.status,
    },
  };
}

// ─── 端末設定（/device-settings — 5タップ + 6桁コードの隠し画面） ─────────────

export type DeviceSettingsInfo = {
  id: string;
  name: string | null;
  status: "PENDING" | "LINKED" | "ACTIVE" | "DISABLED" | "REVOKED";
  settingsCode: string;
  linkedAt: Date | null;
  deviceTokenExpiresAt: Date | null;
  fingerprint: string | null;
};

/**
 * 端末設定用の端末解決 — getDevice と違い **status を絞らない**
 * （DISABLED/REVOKED でもリセット/再リンクできる必要がある）。
 * settingsCode を含むため呼び出し側はコード検証前にクライアントへ返さないこと。
 */
export async function getDeviceForSettings(): Promise<DeviceSettingsInfo | null> {
  const store = await cookies();
  const raw = store.get(DEVICE_COOKIE)?.value;
  if (!raw) return null;
  return prisma.kioskDevice.findUnique({
    where: { deviceTokenHash: sha256hex(raw) },
    select: {
      id: true,
      name: true,
      status: true,
      settingsCode: true,
      linkedAt: true,
      deviceTokenExpiresAt: true,
      fingerprint: true,
    },
  });
}

// ─── 人セッション ────────────────────────────────────────────────────────────

export type KioskUser = {
  sessionId: string;
  userId: string;
  cardId: string;
  deviceId: string;
  displayName: string;
  username: string;
  expiresAt: Date;
  lastActivityAt: Date;
};

/** ログイン成功時: セッション行 + Cookie を作成（LOGIN ログ + モニター通知）。 */
export async function createSession(
  userId: string,
  cardId: string,
  deviceId: string,
): Promise<void> {
  const { raw, hash } = mintToken();
  const now = new Date();
  await prisma.kioskSession.create({
    data: {
      id: hash,
      userId,
      cardId,
      deviceId,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      lastActivityAt: now,
    },
  });
  await recordSessionLog(deviceId, "LOGIN", userId, "login");
  wsBridge()?.notifyDeviceChanged(deviceId);
  const store = await cookies();
  store.set(SESSION_COOKIE, raw, cookieOptions(SESSION_TTL_MS));
}

/** LOGIN/LOGOUT の利用履歴を記録する（best-effort — 失敗してもフローは継続）。 */
async function recordSessionLog(
  deviceId: string,
  type: "LOGIN" | "LOGOUT",
  userId: string,
  source: "login" | "logout" | "expired",
): Promise<void> {
  await prisma.kioskDeviceLog
    .create({ data: { deviceId, type, userId, source } })
    .catch(() => undefined);
}

/**
 * Cookie からログイン中ユーザーを解決。ハード期限 / 5分アイドル / 失効を
 * 毎回サーバー側で検証し、切れていたら行を失効化して null。
 */
export async function getSession(): Promise<KioskUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.kioskSession.findUnique({
    where: { id: sha256hex(raw) },
    include: {
      user: { select: { displayName: true, username: true, isActive: true } },
    },
  });
  if (!session) return null;

  const now = new Date();
  const alive =
    session.user.isActive &&
    isSessionAlive(
      now,
      session.expiresAt,
      session.lastActivityAt,
      session.revokedAt,
    );
  if (!alive) {
    if (!session.revokedAt) {
      await prisma.kioskSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      // 暗黙失効（アイドル/期限切れ）も履歴に残し、モニターへ即時反映
      await recordSessionLog(
        session.deviceId,
        "LOGOUT",
        session.userId,
        "expired",
      );
      wsBridge()?.notifyDeviceChanged(session.deviceId);
    }
    return null;
  }
  return {
    sessionId: session.id,
    userId: session.userId,
    cardId: session.cardId,
    deviceId: session.deviceId,
    displayName: session.user.displayName,
    username: session.user.username,
    expiresAt: session.expiresAt,
    lastActivityAt: session.lastActivityAt,
  };
}

/**
 * ログアウト: セッション失効 + Cookie 削除。
 * 実際に失効させたセッションの帰属（端末/ユーザー）を返し、モニターへ通知する。
 * Cookie なし・行なし・既に失効済みなら null。
 */
export async function destroySession(): Promise<{
  deviceId: string;
  userId: string;
} | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (!raw) return null;

  const session = await prisma.kioskSession.findUnique({
    where: { id: sha256hex(raw) },
    select: { id: true, deviceId: true, userId: true, revokedAt: true },
  });
  if (!session || session.revokedAt) return null;

  await prisma.kioskSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
  await recordSessionLog(session.deviceId, "LOGOUT", session.userId, "logout");
  wsBridge()?.notifyDeviceChanged(session.deviceId);
  return { deviceId: session.deviceId, userId: session.userId };
}
