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

import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "./db";
import { findLocalizedDisplayTemplate } from "./display-template-labels";
import { localized } from "./format";
import type { Locale } from "./i18n";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

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
  /** 盤面自身の表示言語（未設定 = 既定言語 ja）。kiosk_devices.locale と同じ規約。 */
  locale: string | null;
  /** 何を映すか。**画面ごとに持つ** — 共有の「表示内容」レコードは無い。 */
  contentType: DisplayContentType;
  contentConfig: unknown;
  /** 一覧に出す 1 行の要約（「生産状況 / 本社工場」など）。 */
  contentLabel: string;
  refreshIntervalSec: number;
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

/** IMAGE 表示のときに映している画像（管理画面のプレビュー用）。 */
export interface DisplayImageInfo {
  fileId: string;
  filename: string;
  /** /api/admin/files/raw?key=… で引くためのキー。 */
  storageKey: string;
}

export interface DisplayDetail extends DisplayRow {
  /** contentType が IMAGE のときだけ入る。ファイルが消えていれば null。 */
  image: DisplayImageInfo | null;
  lastIpAddress: string | null;
  userAgent: string | null;
  deviceTokenExpiresAt: Date | null;
  activatedAt: Date | null;
  activatedByName: string | null;
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

/**
 * 一覧の「表示内容」列に出す 1 行。
 *
 * 何を映しているかは JSON なので、そのまま出しても読めない。**一覧で
 * 知りたいのは「どの画面か」だけ**なので、テンプレート名（か種別名）に
 * 落とす。設定の中身は詳細で見る。
 */
function describeContent(
  type: string,
  config: unknown,
  tr: Tr,
  locale: Locale,
): string {
  if (type === "APP_PAGE") {
    const page = (config as { page?: unknown } | null)?.page;
    return (
      findLocalizedDisplayTemplate(
        typeof page === "string" ? page : null,
        locale,
      )?.label ?? tr("displaysAdmin.noPageSelected")
    );
  }
  if (type === "METABASE") return tr("displaysAdmin.metabaseDashboard");
  if (type === "URL") return tr("displaysAdmin.externalPage");
  if (type === "IMAGE") return tr("common.image");
  return "—";
}

function onlineAt(now: number, lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return now - lastSeenAt.getTime() < DISPLAY_ONLINE_WINDOW_MS;
}

export async function listDisplays(): Promise<DisplayRow[]> {
  const tr = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const rows = await prisma.displayDevice.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      location: true,
      plantId: true,
      locale: true,
      status: true,
      scalePercent: true,
      machineId: true,
      screenIndex: true,
      lastSeenAt: true,
      appVersion: true,
      linkedAt: true,
      createdAt: true,
      contentType: true,
      contentConfig: true,
      refreshIntervalSec: true,
      plant: { select: { name: true } },
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
      locale: r.locale,
      contentType: r.contentType as DisplayContentType,
      contentConfig: r.contentConfig,
      contentLabel: describeContent(r.contentType, r.contentConfig, tr, locale),
      refreshIntervalSec: r.refreshIntervalSec,
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
  const tr = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const r = await prisma.displayDevice.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      location: true,
      plantId: true,
      locale: true,
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
      contentType: true,
      contentConfig: true,
      refreshIntervalSec: true,
      plant: { select: { name: true } },
      activatedBy: { select: { displayName: true } },
    },
  });
  if (!r) return null;
  const name = jsonName(r.name);

  // 画像表示のときだけ、映している画像の実体を引く（プレビュー用）。
  // 参照先が消えていることはありうる（ファイル管理から消された等）ので、
  // 見つからなければ null のままにして「未設定」として扱う。
  let image: DisplayImageInfo | null = null;
  if (r.contentType === "IMAGE") {
    const fileId = (r.contentConfig as { fileId?: unknown } | null)?.fileId;
    if (typeof fileId === "string") {
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: { id: true, filename: true, storageKey: true },
      });
      if (file) {
        image = {
          fileId: file.id,
          filename: file.filename,
          storageKey: file.storageKey,
        };
      }
    }
  }

  return {
    image,
    id: r.id,
    name: name.text,
    nameJson: name.json,
    location: r.location,
    plantId: r.plantId,
    plantName: jsonName(r.plant?.name).text,
    locale: r.locale,
    contentType: r.contentType as DisplayContentType,
    contentConfig: r.contentConfig,
    contentLabel: describeContent(r.contentType, r.contentConfig, tr, locale),
    refreshIntervalSec: r.refreshIntervalSec,
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

/**
 * 同じ機械につながっている画面（自分を含む・何枚目の昇順）。
 *
 * 1 台で 2 枚出している機械の詳細から、もう一方へ行けるようにするためだけの
 * 一覧。**machineId は Pi の自己申告**なので、用途はこの行き来に限る
 * （権限にも表示内容にも使わない）。1 枚運用（machineId なし）は空を返す。
 */
export async function listMachineScreens(
  machineId: string | null,
): Promise<
  Array<{ id: string; name: string | null; screenIndex: number | null }>
> {
  if (!machineId) return [];
  const rows = await prisma.displayDevice.findMany({
    where: { machineId },
    orderBy: [{ screenIndex: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, screenIndex: true },
  });
  if (rows.length < 2) return []; // まとめる相手が居ない
  return rows.map((r) => ({
    id: r.id,
    name: jsonName(r.name).text,
    screenIndex: r.screenIndex,
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
