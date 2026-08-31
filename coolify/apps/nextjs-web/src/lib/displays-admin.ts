import "server-only";

/**
 * displays-admin.ts — ディスプレイ（SY09 端末管理）の読み取り。server-only・読むだけ。
 *
 * 書き込みは settings/kiosk-devices/displays/actions.ts が持つ
 * （kiosk-admin.ts と同じ分担）。
 *
 * 死活は `last_seen_at` から**読むときに**計算する。状態列に持たせないのは、
 * 「オンライン」を保存すると、書き手が落ちたときに嘘が残り続けるため。
 * WS が繋がっていれば 30 秒ごとに last_seen_at が更新されるので、
 * この計算はソケットの有無を知らなくてよい。
 */

import { prisma } from "./db";
import { localized } from "./format";

/** WS 未接続でも直近この時間内に生存していればオンライン扱い。 */
export const DISPLAY_ONLINE_WINDOW_MS = 5 * 60 * 1000;

export type DisplayStatus =
  | "PENDING"
  | "LINKED"
  | "ACTIVE"
  | "DISABLED"
  | "REVOKED";
export type DisplayContentType = "APP_PAGE" | "METABASE" | "URL" | "IMAGE";

export interface DisplayRow {
  id: string;
  name: string | null;
  nameJson: { ja?: string; en?: string } | null;
  location: string | null;
  plantId: number | null;
  plantName: string | null;
  profileId: string | null;
  profileName: string | null;
  status: DisplayStatus;
  /** 表示倍率（%）。画面の大きさに合わせる微調整。 */
  scalePercent: number;
  /** どの機械の何枚目か（Pi の自己申告。認証には使わない）。 */
  machineId: string | null;
  screenIndex: number | null;
  lastSeenAt: Date | null;
  appVersion: string | null;
  /** WS が使えないときのフォールバック（サーバー側の計算）。 */
  initialOnline: boolean;
  linkedAt: Date | null;
  createdAt: Date;
}

export interface DisplayDetail extends DisplayRow {
  lastIpAddress: string | null;
  userAgent: string | null;
  deviceTokenExpiresAt: Date | null;
  activatedAt: Date | null;
  activatedByName: string | null;
}

export interface DisplayProfileRow {
  id: string;
  name: string | null;
  nameJson: { ja?: string; en?: string } | null;
  description: string | null;
  contentType: DisplayContentType;
  contentConfig: unknown;
  refreshIntervalSec: number;
  isEnabled: boolean;
  /** この表示内容を使っている画面の数（削除の可否判断に使う）。 */
  deviceCount: number;
  updatedAt: Date;
}

function jsonName(value: unknown): {
  text: string | null;
  json: { ja?: string; en?: string } | null;
} {
  if (value == null || typeof value !== "object") {
    return { text: null, json: null };
  }
  const json = value as { ja?: string; en?: string };
  const text = localized(json as never);
  return { text: text === "—" ? null : text, json };
}

function onlineAt(now: number, lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return now - lastSeenAt.getTime() < DISPLAY_ONLINE_WINDOW_MS;
}

export async function listDisplays(): Promise<DisplayRow[]> {
  const rows = await prisma.displayDevice.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      location: true,
      plantId: true,
      status: true,
      scalePercent: true,
      machineId: true,
      screenIndex: true,
      lastSeenAt: true,
      appVersion: true,
      linkedAt: true,
      createdAt: true,
      plant: { select: { name: true } },
      profile: { select: { id: true, name: true } },
    },
  });
  const now = Date.now();
  return rows.map((r) => {
    const name = jsonName(r.name);
    return {
      id: r.id,
      name: name.text,
      nameJson: name.json,
      location: r.location,
      plantId: r.plantId,
      plantName: jsonName(r.plant?.name).text,
      profileId: r.profile?.id ?? null,
      profileName: jsonName(r.profile?.name).text,
      status: r.status as DisplayStatus,
      scalePercent: r.scalePercent,
      machineId: r.machineId,
      screenIndex: r.screenIndex,
      lastSeenAt: r.lastSeenAt,
      appVersion: r.appVersion,
      initialOnline: r.status === "ACTIVE" && onlineAt(now, r.lastSeenAt),
      linkedAt: r.linkedAt,
      createdAt: r.createdAt,
    };
  });
}

export async function getDisplayDetail(
  id: string,
): Promise<DisplayDetail | null> {
  const r = await prisma.displayDevice.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      location: true,
      plantId: true,
      status: true,
      scalePercent: true,
      machineId: true,
      screenIndex: true,
      lastSeenAt: true,
      lastIpAddress: true,
      userAgent: true,
      appVersion: true,
      deviceTokenExpiresAt: true,
      linkedAt: true,
      activatedAt: true,
      createdAt: true,
      plant: { select: { name: true } },
      profile: { select: { id: true, name: true } },
      activatedBy: { select: { displayName: true } },
    },
  });
  if (!r) return null;
  const name = jsonName(r.name);
  return {
    id: r.id,
    name: name.text,
    nameJson: name.json,
    location: r.location,
    plantId: r.plantId,
    plantName: jsonName(r.plant?.name).text,
    profileId: r.profile?.id ?? null,
    profileName: jsonName(r.profile?.name).text,
    status: r.status as DisplayStatus,
    scalePercent: r.scalePercent,
    machineId: r.machineId,
    screenIndex: r.screenIndex,
    lastSeenAt: r.lastSeenAt,
    appVersion: r.appVersion,
    initialOnline: r.status === "ACTIVE" && onlineAt(Date.now(), r.lastSeenAt),
    linkedAt: r.linkedAt,
    createdAt: r.createdAt,
    lastIpAddress: r.lastIpAddress,
    userAgent: r.userAgent,
    deviceTokenExpiresAt: r.deviceTokenExpiresAt,
    activatedAt: r.activatedAt,
    activatedByName: r.activatedBy?.displayName ?? null,
  };
}

export async function listDisplayProfiles(): Promise<DisplayProfileRow[]> {
  const rows = await prisma.displayProfile.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      contentType: true,
      contentConfig: true,
      refreshIntervalSec: true,
      isEnabled: true,
      updatedAt: true,
      _count: { select: { devices: true } },
    },
  });
  return rows.map((r) => {
    const name = jsonName(r.name);
    return {
      id: r.id,
      name: name.text,
      nameJson: name.json,
      description: r.description,
      contentType: r.contentType as DisplayContentType,
      contentConfig: r.contentConfig,
      refreshIntervalSec: r.refreshIntervalSec,
      isEnabled: r.isEnabled,
      deviceCount: r._count.devices,
      updatedAt: r.updatedAt,
    };
  });
}

/** ペアリング画面の選択肢（有効なものだけ出す）。 */
export async function listPairableProfiles(): Promise<
  Array<{ id: string; name: string; contentType: DisplayContentType }>
> {
  const rows = await prisma.displayProfile.findMany({
    where: { isEnabled: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, contentType: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: jsonName(r.name).text ?? "（名称未設定）",
    contentType: r.contentType as DisplayContentType,
  }));
}

/** 拠点の選択肢。 */
export async function listPlantOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  const rows = await prisma.plant.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return rows.map((p) => ({
    value: String(p.id),
    label: `${p.code} ${jsonName(p.name).text ?? ""}`.trim(),
  }));
}
