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
import type { DeviceOwnership } from "./device-ownership-core";
import type { DeviceProfileSummary } from "./device-profile-core";
import { toProfileSummary } from "./device-profile-core";
import type { LocalizedText } from "./format";
import { deviceName, localized, localizedTranslations } from "./format";

/** 多言語 JSON（または旧文字列）から編集用の片側を取り出す。 */
function namePart(value: unknown, key: "ja" | "en"): string {
  if (value == null) return "";
  if (typeof value === "string") return value; // 移行前の文字列データ
  const v = value as Record<string, unknown>;
  return typeof v[key] === "string" ? (v[key] as string) : "";
}

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
  /** 有効期間（テンポラリカード用。null = 無期限）。 */
  validFrom: string | null;
  validUntil: string | null;
  /** 同時ログイン上限（超過分は最も古いセッションから失効）。 */
  maxActiveSessions: number;
}

function toCardRow(
  now: number,
  r: {
    id: string;
    status: KioskCardRow["status"];
    userId: string | null;
    user: { displayName: string; username: string } | null;
    pinHash: string | null;
    pinLockedUntil: Date | null;
    lastUsedAt: Date | null;
    useCount: number;
    assignedAt: Date | null;
    createdAt: Date | null;
    validFrom: Date | null;
    validUntil: Date | null;
    maxActiveSessions: number;
  },
): KioskCardRow {
  return {
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
    validFrom: r.validFrom?.toISOString() ?? null,
    validUntil: r.validUntil?.toISOString() ?? null,
    maxActiveSessions: r.maxActiveSessions,
  };
}

export async function listKioskCards(): Promise<KioskCardRow[]> {
  const now = Date.now();
  const rows = await prisma.kioskCard.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      user: { select: { displayName: true, username: true } },
    },
  });
  return rows.map((r) => toCardRow(now, r));
}

/** カード詳細（SY08 /settings/kiosk-cards/[id]）。 */
export interface KioskCardDetail extends KioskCardRow {
  pinSetAt: string | null;
  pinLastVerifiedAt: string | null;
  assignedByName: string | null;
  revokedAt: string | null;
  revokedByName: string | null;
}

export async function getKioskCard(
  id: string,
): Promise<KioskCardDetail | null> {
  const now = Date.now();
  const r = await prisma.kioskCard.findUnique({
    where: { id },
    include: {
      user: { select: { displayName: true, username: true } },
      assignedBy: { select: { displayName: true } },
      revokedBy: { select: { displayName: true } },
    },
  });
  if (!r) return null;
  return {
    ...toCardRow(now, r),
    pinSetAt: r.pinSetAt?.toISOString() ?? null,
    pinLastVerifiedAt: r.pinLastVerifiedAt?.toISOString() ?? null,
    assignedByName: r.assignedBy?.displayName ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    revokedByName: r.revokedBy?.displayName ?? null,
  };
}

/** カードの最近のログインセッション（詳細ページの利用履歴）。 */
export interface KioskCardSessionRow {
  id: string;
  deviceName: string | null;
  plantLabel: string | null;
  createdAt: string;
  lastActivityAt: string;
  revokedAt: string | null;
}

export async function listCardRecentSessions(
  cardId: string,
  limit = 20,
): Promise<KioskCardSessionRow[]> {
  const rows = await prisma.kioskSession.findMany({
    where: { cardId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      device: {
        select: { name: true, plant: { select: { name: true } } },
      },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    deviceName: deviceName(s.device.name),
    plantLabel: s.device.plant
      ? localized(s.device.plant.name as LocalizedText)
      : null,
    createdAt: s.createdAt.toISOString(),
    lastActivityAt: s.lastActivityAt.toISOString(),
    revokedAt: s.revokedAt?.toISOString() ?? null,
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
  /** 表示用の端末名（現在ロケール解決済み。未設定は null）。 */
  name: string | null;
  /** 編集用の原文（多言語 JSON の各言語）。 */
  nameJa: string;
  nameEn: string;
  /** 日本語以外の翻訳（LocalizedTextInput の多言語ポップアップ初期値）。 */
  nameTranslations: Record<string, string>;
  location: string | null;
  status: "PENDING" | "LINKED" | "ACTIVE" | "DISABLED" | "REVOKED";
  plantId: number | null;
  plantLabel: string | null;
  /** 既定の作業場所（実績への自動記録に使う。未設定は null）。 */
  defaultWorkLocationId: number | null;
  defaultWorkLocationLabel: string | null;
  floorMapId: string | null;
  /** フロアマップ上のピン座標（%）。未配置は null。 */
  mapX: number | null;
  mapY: number | null;
  lastActivityAt: string | null;
  /**
   * メンテナンス退出 PIN を最後に受け取れた時刻。null = 一度も同期できて
   * いない（端末はビルド時の既定 PIN のまま）。lastActivityAt とは別物 —
   * 通信できていても 401（未リンク/トークン切れ）や PinSync 以前の APK では
   * PIN は届いていない。
   */
  unlockPinSyncedAt: string | null;
  /** そのとき受け取った PIN の rotated_at（履歴の行を引くキー）。 */
  unlockPinRotatedAt: string | null;
  /** アテステーション鍵の SHA-256（未束縛は null）。 */
  fingerprint: string | null;
  /** 所有区分（自動判定。判定根拠は ownershipSource）。 */
  ownership: DeviceOwnership;
  ownershipSource: string | null;
  /** 署名検証済みの端末プロファイル（v0.6.0+ のラッパー。無ければ null）。 */
  deviceProfile: DeviceProfileSummary | null;
  deviceProfileAt: string | null;
  /** 最後に観測した UA / IP（毎リクエスト更新）。 */
  userAgent: string | null;
  lastIpAddress: string | null;
  /** リンクした時点のスナップショット（以後不変）。 */
  linkedUserAgent: string | null;
  linkedIpAddress: string | null;
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
  /** 最新の GPS 位置（端末が 5 分ごとに報告。未取得は null）。 */
  latestLocation: {
    latitude: number;
    longitude: number;
    accuracyM: number | null;
    recordedAt: string;
  } | null;
}

function deviceInclude(now: number) {
  return {
    plant: { select: { code: true, name: true } },
    defaultWorkLocation: {
      select: { id: true, name: true, group: { select: { name: true } } },
    },
    activatedBy: { select: { displayName: true } },
    sessions: liveSessionInclude(now),
    locations: {
      orderBy: { recordedAt: "desc" as const },
      take: 1,
    },
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
    // 表示用に多言語 JSON を解決（編集は nameJa/nameEn を別途返す）。
    name: deviceName(r.name),
    nameJa: namePart(r.name, "ja"),
    nameEn: namePart(r.name, "en"),
    nameTranslations: localizedTranslations(r.name as LocalizedText | null),
    location: r.location,
    status: r.status,
    plantId: r.plantId,
    plantLabel: r.plant
      ? `${r.plant.code} ${localized(r.plant.name as LocalizedText | null)}`
      : null,
    defaultWorkLocationId: r.defaultWorkLocation?.id ?? null,
    defaultWorkLocationLabel: r.defaultWorkLocation
      ? `${localized(r.defaultWorkLocation.group.name as LocalizedText | null)} / ${localized(r.defaultWorkLocation.name as LocalizedText | null)}`
      : null,
    floorMapId: r.floorMapId,
    mapX: r.mapX != null ? Number(r.mapX) : null,
    mapY: r.mapY != null ? Number(r.mapY) : null,
    lastActivityAt: r.lastActivityAt?.toISOString() ?? null,
    unlockPinSyncedAt: r.unlockPinSyncedAt?.toISOString() ?? null,
    unlockPinRotatedAt: r.unlockPinRotatedAt?.toISOString() ?? null,
    fingerprint: r.fingerprint,
    ownership: r.ownership,
    ownershipSource: r.ownershipSource,
    deviceProfile: toProfileSummary(r.deviceProfile),
    deviceProfileAt: r.deviceProfileAt?.toISOString() ?? null,
    userAgent: r.userAgent,
    lastIpAddress: r.lastIpAddress,
    linkedUserAgent: r.linkedUserAgent,
    linkedIpAddress: r.linkedIpAddress,
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
    latestLocation: r.locations[0]
      ? {
          latitude: Number(r.locations[0].latitude),
          longitude: Number(r.locations[0].longitude),
          accuracyM:
            r.locations[0].accuracyM != null
              ? Number(r.locations[0].accuracyM)
              : null,
          recordedAt: r.locations[0].recordedAt.toISOString(),
        }
      : null,
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

// ── 利用履歴（セッションベース — LOGIN/LOGOUT イベントの対より正確） ─────────

export interface KioskDeviceSessionRow {
  id: string;
  userName: string;
  startedAt: string;
  /** null = 利用中（未失効セッション）。 */
  endedAt: string | null;
}

/**
 * 端末のセッション履歴（新しい順・カーソルページング）。
 * 終了時刻は revokedAt（ログアウト/スイープ失効）。未失効でもハード期限を
 * 過ぎていれば期限時刻を終了として扱う（スイープ遅延の保険）。
 */
export async function listDeviceSessions(
  deviceId: string,
  cursor?: string,
): Promise<{ rows: KioskDeviceSessionRow[]; nextCursor: string | null }> {
  const now = Date.now();
  const rows = await prisma.kioskSession.findMany({
    where: { deviceId },
    orderBy: { createdAt: "desc" },
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { displayName: true } },
    },
  });
  const nextCursor = rows.length > 50 ? (rows[50]?.id ?? null) : null;
  return {
    rows: rows.slice(0, 50).map((r) => {
      const ended =
        r.revokedAt ?? (r.expiresAt.getTime() < now ? r.expiresAt : null);
      return {
        id: r.id,
        userName: r.user.displayName,
        startedAt: r.createdAt.toISOString(),
        endedAt: ended?.toISOString() ?? null,
      };
    }),
    nextCursor,
  };
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
  plantId: number;
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
    orderBy: [{ plantId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { devices: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    plantId: r.plantId,
    name: r.name,
    fileId: r.fileId,
    sortOrder: r.sortOrder,
    deviceCount: r._count.devices,
  }));
}

/** フロアマップ上の保管場所ピン（読み取り専用レイヤ — 配置は MS0C）。 */
export interface StorageLocationPin {
  id: number;
  floorMapId: string;
  name: string;
  code: string;
  mapX: number;
  mapY: number;
  shelfCount: number;
}

/** 配置済み保管場所のピン一覧（フロアマップは端末管理と共用）。 */
export async function listStorageLocationPins(): Promise<StorageLocationPin[]> {
  const rows = await prisma.storageLocation.findMany({
    where: { isActive: true, floorMapId: { not: null } },
    include: { _count: { select: { shelves: true } } },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows
    .filter((r) => r.floorMapId != null && r.mapX != null && r.mapY != null)
    .map((r) => {
      const name = r.name as { ja?: string } | null;
      return {
        id: r.id,
        floorMapId: r.floorMapId as string,
        name: name?.ja ?? r.code,
        code: r.code,
        mapX: Number(r.mapX),
        mapY: Number(r.mapY),
        shelfCount: r._count.shelves,
      };
    });
}

/** 拠点の選択肢（有効のみ）。value = String(plants.id)。 */
export interface KioskPlantOption {
  value: string;
  label: string;
}

export async function listKioskPlantOptions(): Promise<KioskPlantOption[]> {
  const rows = await prisma.plant.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code} ${localized(r.name as LocalizedText | null)}`,
  }));
}
