import "server-only";

/**
 * kiosk-admin.ts — キオスク管理（SY08 QRカード管理 / SY09 端末管理）の
 * データ取得。server-only・読み取り専用。
 *
 * 書き込みは各画面の Server Actions（settings/kiosk-cards/actions.ts /
 * settings/kiosk-devices/actions.ts）。閲覧は RBAC（kiosk:READ）でゲート —
 * 呼び出し側ページで checkPermission を通すこと。
 */

import { prisma } from "./db";
import type { LocalizedText } from "./format";
import { localized } from "./format";

/**
 * WS 未接続でも直近この時間内の活動があればオンライン扱い。
 * kiosk 側 ONLINE_WINDOW_MS / IDLE_TIMEOUT_MS（kiosk-auth-core.ts）および
 * shared-db/sql/kiosk-cron.sql の interval '5 minutes' と同値に保つこと。
 */
export const KIOSK_ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** 端末の最新ライブセッション（= 現在の利用者）の Prisma include 句。 */
function liveSessionInclude(now: number) {
  return {
    where: {
      revokedAt: null,
      expiresAt: { gt: new Date(now) },
      lastActivityAt: { gt: new Date(now - KIOSK_ONLINE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      userId: true,
      user: { select: { displayName: true } },
    },
  };
}

// ── QRカード（SY08） ─────────────────────────────────────────────────────────

export interface KioskCardRow {
  /** カード ID（Crockford 16桁・正規化形）。 */
  id: string;
  status: "UNASSIGNED" | "ASSIGNED" | "SUSPENDED" | "REVOKED";
  userId: string | null;
  userDisplayName: string | null;
  userUsername: string | null;
  pinSet: boolean;
  /** PIN 連続失敗によるロック中か。 */
  pinLocked: boolean;
  lastUsedAt: string | null;
  useCount: number;
  assignedAt: string | null;
  createdAt: string | null;
}

export async function listKioskCards(): Promise<KioskCardRow[]> {
  const now = Date.now();
  const rows = await prisma.kioskCard.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      user: { select: { displayName: true, username: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    userId: r.userId,
    userDisplayName: r.user?.displayName ?? null,
    userUsername: r.user?.username ?? null,
    pinSet: r.pinHash != null,
    pinLocked: r.pinLockedUntil != null && r.pinLockedUntil.getTime() > now,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    useCount: r.useCount,
    assignedAt: r.assignedAt?.toISOString() ?? null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

/** 印刷シート用: 選択されたカード（割当ユーザー付き）。 */
export interface KioskCardPrintRow {
  id: string;
  userDisplayName: string | null;
}

export async function fetchKioskCardsForPrint(
  ids: string[],
): Promise<KioskCardPrintRow[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.kioskCard.findMany({
    where: { id: { in: ids }, status: { not: "REVOKED" } },
    include: { user: { select: { displayName: true } } },
  });
  // 指定順を保つ。
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r) => r != null)
    .map((r) => ({
      id: r.id,
      userDisplayName: r.user?.displayName ?? null,
    }));
}

/** 割当先ユーザーの選択肢（有効ユーザーのみ）。value = user uuid。 */
export interface KioskUserOption {
  value: string;
  label: string;
}

export async function listKioskAssignableUsers(): Promise<KioskUserOption[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, group: { in: ["EMPLOYEE", "SYSTEM"] } },
    orderBy: { username: "asc" },
    select: { id: true, username: true, displayName: true },
  });
  return users.map((u) => ({
    value: u.id,
    label: `${u.displayName}（${u.username}）`,
  }));
}

// ── 端末（SY09） ─────────────────────────────────────────────────────────────

export interface KioskDeviceRow {
  id: string;
  name: string | null;
  location: string | null;
  status: "PENDING" | "LINKED" | "ACTIVE" | "DISABLED" | "REVOKED";
  factoryId: number | null;
  factoryLabel: string | null;
  floorMapId: string | null;
  /** フロアマップ上のピン座標（%）。未配置は null。 */
  mapX: number | null;
  mapY: number | null;
  lastActivityAt: string | null;
  /** アテステーション鍵の SHA-256（未束縛は null）。 */
  fingerprint: string | null;
  /** 端末設定画面（5タップ）の解錠コード（6桁）。編集モーダルで表示。 */
  settingsCode: string;
  /** サーバー計算の初期オンライン判定（WS 未接続時のフォールバック）。 */
  initialOnline: boolean;
  /** 現在ログイン中のユーザー（ライブセッション。WS 未接続時のフォールバック）。 */
  currentUserId: string | null;
  currentUserName: string | null;
  activatedByName: string | null;
  activatedAt: string | null;
  /** タブレットとリンクした日時（LINKED 以降）。 */
  linkedAt: string | null;
  createdAt: string | null;
}

function deviceInclude(now: number) {
  return {
    factory: { select: { code: true, name: true } },
    activatedBy: { select: { displayName: true } },
    sessions: liveSessionInclude(now),
  };
}

type DeviceWithIncludes = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.kioskDevice.findUnique<{
        where: { id: string };
        include: ReturnType<typeof deviceInclude>;
      }>
    >
  >
>;

function toDeviceRow(r: DeviceWithIncludes, now: number): KioskDeviceRow {
  return {
    id: r.id,
    name: r.name,
    location: r.location,
    status: r.status,
    factoryId: r.factoryId,
    factoryLabel: r.factory
      ? `${r.factory.code} ${localized(r.factory.name as LocalizedText | null)}`
      : null,
    floorMapId: r.floorMapId,
    mapX: r.mapX != null ? Number(r.mapX) : null,
    mapY: r.mapY != null ? Number(r.mapY) : null,
    lastActivityAt: r.lastActivityAt?.toISOString() ?? null,
    fingerprint: r.fingerprint,
    settingsCode: r.settingsCode,
    initialOnline:
      r.status === "ACTIVE" &&
      r.lastActivityAt != null &&
      now - r.lastActivityAt.getTime() < KIOSK_ONLINE_WINDOW_MS,
    currentUserId: r.sessions[0]?.userId ?? null,
    currentUserName: r.sessions[0]?.user.displayName ?? null,
    activatedByName: r.activatedBy?.displayName ?? null,
    activatedAt: r.activatedAt?.toISOString() ?? null,
    linkedAt: r.linkedAt?.toISOString() ?? null,
    createdAt: r.createdAt?.toISOString() ?? null,
  };
}

export async function listKioskDevices(): Promise<KioskDeviceRow[]> {
  const now = Date.now();
  const rows = await prisma.kioskDevice.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: deviceInclude(now),
  });
  return rows.map((r) => toDeviceRow(r, now));
}

/** 端末詳細ページ用: 1 台分（存在しなければ null）。 */
export async function getKioskDevice(
  id: string,
): Promise<KioskDeviceRow | null> {
  const now = Date.now();
  const row = await prisma.kioskDevice.findUnique({
    where: { id },
    include: deviceInclude(now),
  });
  return row ? toDeviceRow(row, now) : null;
}

/** 最近この端末を使ったユーザー（LOGIN ログの集計・最終ログイン降順）。 */
export interface KioskDeviceRecentUser {
  userId: string;
  displayName: string;
  username: string;
  lastLoginAt: string;
  loginCount: number;
}

export async function listRecentDeviceUsers(
  deviceId: string,
  limit = 12,
): Promise<KioskDeviceRecentUser[]> {
  const groups = await prisma.kioskDeviceLog.groupBy({
    by: ["userId"],
    where: { deviceId, type: "LOGIN", userId: { not: null } },
    _max: { createdAt: true },
    _count: { _all: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: limit,
  });
  const ids = groups.map((g) => g.userId).filter((v): v is string => v != null);
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true, username: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return groups.flatMap((g) => {
    const user = g.userId ? byId.get(g.userId) : null;
    if (!user || !g._max.createdAt) return [];
    return [
      {
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        lastLoginAt: g._max.createdAt.toISOString(),
        loginCount: g._count._all,
      },
    ];
  });
}

// ── プレゼンス（WS 不通時の 30 秒ポーリング用の軽量版） ──────────────────────

export interface KioskPresenceRow {
  deviceId: string;
  isOnline: boolean;
  lastActivityAt: string | null;
  user: { userId: string; displayName: string } | null;
}

/** 全 ACTIVE/DISABLED 端末のオンライン状態 + 利用者（ポーリングフォールバック）。 */
export async function listKioskPresence(): Promise<KioskPresenceRow[]> {
  const now = Date.now();
  const rows = await prisma.kioskDevice.findMany({
    where: { status: { in: ["ACTIVE", "DISABLED"] } },
    select: {
      id: true,
      status: true,
      lastActivityAt: true,
      sessions: liveSessionInclude(now),
    },
  });
  return rows.map((r) => ({
    deviceId: r.id,
    isOnline:
      r.status === "ACTIVE" &&
      r.lastActivityAt != null &&
      now - r.lastActivityAt.getTime() < KIOSK_ONLINE_WINDOW_MS,
    lastActivityAt: r.lastActivityAt?.toISOString() ?? null,
    user: r.sessions[0]
      ? {
          userId: r.sessions[0].userId,
          displayName: r.sessions[0].user.displayName,
        }
      : null,
  }));
}

// ── 利用履歴（kiosk_device_logs） ────────────────────────────────────────────

export interface KioskDeviceLogRow {
  /** BigInt id の文字列表現（カーソルにも使う）。 */
  id: string;
  type: "ONLINE" | "OFFLINE" | "LOGIN" | "LOGOUT";
  userName: string | null;
  source: string | null;
  createdAt: string;
}

export const KIOSK_DEVICE_LOG_PAGE_SIZE = 50;

/** 端末の利用履歴を新しい順にページ取得（cursor = 前ページ末尾の id）。 */
export async function listKioskDeviceLogs(
  deviceId: string,
  cursor?: string,
): Promise<{ rows: KioskDeviceLogRow[]; nextCursor: string | null }> {
  const rows = await prisma.kioskDeviceLog.findMany({
    where: {
      deviceId,
      ...(cursor ? { id: { lt: BigInt(cursor) } } : {}),
    },
    orderBy: { id: "desc" },
    take: KIOSK_DEVICE_LOG_PAGE_SIZE + 1,
    include: { user: { select: { displayName: true } } },
  });
  const page = rows.slice(0, KIOSK_DEVICE_LOG_PAGE_SIZE);
  return {
    rows: page.map((r) => ({
      id: r.id.toString(),
      type: r.type,
      userName: r.user?.displayName ?? null,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor:
      rows.length > KIOSK_DEVICE_LOG_PAGE_SIZE
        ? (page[page.length - 1]?.id.toString() ?? null)
        : null,
  };
}

// ── フロアマップ ─────────────────────────────────────────────────────────────

export interface KioskFloorMapRow {
  id: string;
  factoryId: number;
  name: string;
  /** 図面画像の files.id（未設定は null）。 */
  fileId: string | null;
  sortOrder: number;
  /** このマップに配置済みの端末数。 */
  deviceCount: number;
}

export async function listKioskFloorMaps(): Promise<KioskFloorMapRow[]> {
  const rows = await prisma.kioskFloorMap.findMany({
    where: { isActive: true },
    orderBy: [{ factoryId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { devices: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    factoryId: r.factoryId,
    name: r.name,
    fileId: r.fileId,
    sortOrder: r.sortOrder,
    deviceCount: r._count.devices,
  }));
}

/** 工場の選択肢（有効のみ）。value = String(factories.id)。 */
export interface KioskFactoryOption {
  value: string;
  label: string;
}

export async function listKioskFactoryOptions(): Promise<KioskFactoryOption[]> {
  const rows = await prisma.factory.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code} ${localized(r.name as LocalizedText | null)}`,
  }));
}
