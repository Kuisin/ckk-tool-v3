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

/** WS 未接続でも直近この時間内の活動があればオンライン扱い（kiosk 側と同値）。 */
export const KIOSK_ONLINE_WINDOW_MS = 5 * 60 * 1000;

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
  /** サーバー計算の初期オンライン判定（WS 未接続時のフォールバック）。 */
  initialOnline: boolean;
  activatedByName: string | null;
  activatedAt: string | null;
  /** タブレットとリンクした日時（LINKED 以降）。 */
  linkedAt: string | null;
  createdAt: string | null;
}

export async function listKioskDevices(): Promise<KioskDeviceRow[]> {
  const now = Date.now();
  const rows = await prisma.kioskDevice.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      factory: { select: { code: true, name: true } },
      activatedBy: { select: { displayName: true } },
    },
  });
  return rows.map((r) => ({
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
    initialOnline:
      r.status === "ACTIVE" &&
      r.lastActivityAt != null &&
      now - r.lastActivityAt.getTime() < KIOSK_ONLINE_WINDOW_MS,
    activatedByName: r.activatedBy?.displayName ?? null,
    activatedAt: r.activatedAt?.toISOString() ?? null,
    linkedAt: r.linkedAt?.toISOString() ?? null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
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
