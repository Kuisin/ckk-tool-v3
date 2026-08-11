"use server";

/**
 * Server Actions — 端末管理（SY09, /settings/kiosk-devices）。
 *
 * キオスク端末プロファイル（app.kiosk_devices）の作成・リンク・リンク解除・
 * 有効化・編集・無効化・取り消しと、フロアマップ（app.kiosk_floor_maps）の
 * 管理・ピン配置。全アクションを RBAC（kiosk）でゲートし、監査ログ
 * （audit_logs）を記録する。
 *
 * プロファイル先行の登録コントラクト（nextjs-kiosk /setup と対）:
 *   1. 管理者が本画面で端末プロファイルを作成（PENDING = オープン）。
 *   2. タブレットの /setup が QR + コード（kiosk_link_requests・10分期限）を
 *      表示 → 管理者が本画面でそのコードを入力/スキャンし、オープンな
 *      （PENDING の）プロファイルにリンク → LINKED 化。
 *   3. 管理者が LINKED の行のみ有効化（ACTIVE）→ タブレット側がポーリングで
 *      検知し自らデバイストークンを発行する。よってここではトークンには
 *      一切触れない。
 *   端末交換時は「リンク解除」でプロファイルをオープン（PENDING）に戻し、
 *   名称・工場・場所・フロアマップのピンを保ったまま再リンクできる。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import {
  type KioskDeviceLogRow,
  type KioskPresenceRow,
  listKioskDeviceLogs,
  listKioskPresence,
} from "@/lib/kiosk-admin";
import { mintMonitorToken } from "@/lib/kiosk-ws-token";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject, putObject } from "@/lib/storage";

const BASE_PATH = "/settings/kiosk-devices";

const uuidSchema = z.string().uuid("対象の指定が不正です");

function revalidate() {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/map`);
}

// ── プレゼンス WS トークン ───────────────────────────────────────────────────

/**
 * 端末プレゼンス WS（kiosk 側 /api/kiosk/ws）のモニタートークンを発行する。
 * KIOSK_WS_SECRET 未設定時は null（クライアントは静的フォールバック表示）。
 */
export async function mintKioskWsToken(): Promise<
  ActionResult<{ token: string | null }>
> {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) return actionError(authz.error);
  const secret = process.env.KIOSK_WS_SECRET;
  if (!secret) return actionOk({ token: null });
  return actionOk({ token: mintMonitorToken(secret) });
}

/**
 * プレゼンスの現況を返す（WS 不通時に useKioskPresence が 30 秒間隔で
 * ポーリングするフォールバック）。
 */
export async function fetchKioskPresence(): Promise<
  ActionResult<{ devices: KioskPresenceRow[] }>
> {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) return actionError(authz.error);
  try {
    return actionOk({ devices: await listKioskPresence() });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "取得に失敗しました"));
  }
}

/** 端末の利用履歴（kiosk_device_logs）をページ取得する。 */
export async function fetchDeviceLogs(
  deviceId: string,
  cursor?: string,
): Promise<
  ActionResult<{ rows: KioskDeviceLogRow[]; nextCursor: string | null }>
> {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(deviceId);
  if (!parsed.success) return actionError("入力が不正です");
  if (cursor != null && !/^\d+$/.test(cursor)) {
    return actionError("入力が不正です");
  }
  try {
    return actionOk(await listKioskDeviceLogs(parsed.data, cursor));
  } catch (e) {
    return actionError(prismaErrorMessage(e, "利用履歴の取得に失敗しました"));
  }
}

// ── プロファイル作成・リンク ────────────────────────────────────────────────

const createProfileInput = z.object({
  name: z.string().min(1, "端末名を入力してください"),
  factoryId: z.number().int().positive("工場を選択してください"),
  location: z.string().optional(),
});

export type CreateDeviceProfileInput = z.infer<typeof createProfileInput>;

/**
 * 端末プロファイルを作成する（PENDING = オープン）。
 * タブレット側 /setup のコードを「端末をリンク」で入力/スキャンしてリンクする。
 */
export async function createDeviceProfile(
  raw: CreateDeviceProfileInput,
): Promise<ActionResult<{ id: string }>> {
  const authz = await checkPermission("kiosk", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = createProfileInput.safeParse(raw);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;

  try {
    const factory = await prisma.factory.findUnique({
      where: { id: v.factoryId },
      select: { isActive: true },
    });
    if (!factory || !factory.isActive) {
      return actionError("対象の工場が見つかりません");
    }
    const created = await prisma.kioskDevice.create({
      data: {
        status: "PENDING",
        name: v.name.trim(),
        factoryId: v.factoryId,
        location: v.location?.trim() || null,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "kiosk_devices",
      recordId: created.id,
      after: {
        status: "PENDING",
        name: v.name.trim(),
        factoryId: v.factoryId,
        location: v.location?.trim() || null,
      },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "端末プロファイルの作成に失敗しました"),
    );
  }
}

/**
 * タブレット側 /setup が表示したコード（kiosk_link_requests）を使って、
 * 物理端末をオープン（PENDING）なプロファイルにリンクする（→ LINKED）。
 */
export async function linkDeviceToProfile(
  profileId: string,
  code: string,
): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsedId = uuidSchema.safeParse(profileId);
  if (!parsedId.success) return actionError("入力が不正です");
  const normalized = normalizeCode(code);
  if (normalized.length !== 12) {
    return actionError("コードは 12 文字で入力してください");
  }

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsedId.data },
      select: { status: true },
    });
    if (!device) return actionError("対象の端末プロファイルが見つかりません");
    if (device.status !== "PENDING") {
      return actionError(
        "オープンな（未リンクの）プロファイルにのみリンクできます",
      );
    }
    const now = new Date();
    const request = await prisma.kioskLinkRequest.findFirst({
      where: { code: normalized, deviceId: null, expiresAt: { gt: now } },
      select: { id: true, userAgent: true, lastIpAddress: true },
    });
    if (!request) {
      return actionError(
        "コードが無効か期限切れです。タブレット側で再表示してください",
      );
    }
    await prisma.$transaction([
      prisma.kioskLinkRequest.update({
        where: { id: request.id },
        data: { deviceId: parsedId.data },
      }),
      prisma.kioskDevice.update({
        where: { id: parsedId.data },
        data: {
          status: "LINKED",
          linkedAt: now,
          userAgent: request.userAgent,
          lastIpAddress: request.lastIpAddress,
        },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsedId.data,
      before: { status: "PENDING" },
      after: { status: "LINKED", note: "タブレットとリンク" },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "端末のリンクに失敗しました"));
  }
}

/**
 * リンク解除 — 物理端末をプロファイルから切り離してオープン（PENDING）に戻す。
 * 名称・工場・場所・フロアマップのピンは保持。セッション・デバイストークン・
 * アテステーション鍵は破棄する（端末の交換・故障時に再リンクするため）。
 */
export async function unlinkDevice(id: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { status: true },
    });
    if (!device) return actionError("対象の端末が見つかりません");
    if (
      device.status !== "LINKED" &&
      device.status !== "ACTIVE" &&
      device.status !== "DISABLED"
    ) {
      return actionError("この端末はリンク解除できる状態ではありません");
    }
    const now = new Date();
    const openSessions = await prisma.kioskSession.findMany({
      where: { deviceId: parsed.data, revokedAt: null },
      select: { userId: true },
    });
    await prisma.$transaction([
      prisma.kioskDevice.update({
        where: { id: parsed.data },
        data: {
          status: "PENDING",
          linkedAt: null,
          deviceTokenHash: null,
          deviceTokenExpiresAt: null,
          devicePublicKey: null,
          fingerprint: null,
          userAgent: null,
          lastIpAddress: null,
        },
      }),
      prisma.kioskSession.updateMany({
        where: { deviceId: parsed.data, revokedAt: null },
        data: { revokedAt: now },
      }),
      // 管理者失効も利用履歴（LOGOUT）に残す
      prisma.kioskDeviceLog.createMany({
        data: openSessions.map((s) => ({
          deviceId: parsed.data,
          type: "LOGOUT" as const,
          userId: s.userId,
          source: "admin",
        })),
      }),
      prisma.kioskLinkRequest.deleteMany({
        where: { deviceId: parsed.data },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      before: { status: device.status },
      after: { status: "PENDING", note: "リンク解除" },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "リンク解除に失敗しました"));
  }
}

/** 端末プロファイルを削除する（リンク前 = PENDING のみ。ハード削除）。 */
export async function deleteDeviceProfile(id: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { status: true, name: true, factoryId: true },
    });
    if (!device) return actionError("対象の端末プロファイルが見つかりません");
    if (device.status !== "PENDING") {
      return actionError(
        "リンク済み・有効化済みの端末は削除できません（取り消しを使用してください）",
      );
    }
    await prisma.kioskDevice.delete({ where: { id: parsed.data } });
    await recordAudit({
      action: "DELETE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      before: {
        status: device.status,
        name: device.name,
        factoryId: device.factoryId,
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "端末プロファイルの削除に失敗しました"),
    );
  }
}

// ── 有効化 ──────────────────────────────────────────────────────────────────

/**
 * リンク済み端末を有効化する（LINKED → ACTIVE）。
 * リンク前（PENDING）の有効化は許可しない — タブレットとリンクしてから。
 */
export async function activateDevice(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { status: true },
    });
    if (!device) return actionError("対象の端末プロファイルが見つかりません");
    if (device.status === "PENDING") {
      return actionError(
        "リンクされていない端末プロファイルは有効化できません",
      );
    }
    if (device.status === "ACTIVE") {
      return actionError("この端末は既に有効です");
    }
    if (device.status !== "LINKED") {
      return actionError("この端末は有効化できる状態ではありません");
    }
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: {
        status: "ACTIVE",
        activatedById: authz.userId,
        activatedAt: new Date(),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      before: { status: "LINKED" },
      after: { status: "ACTIVE" },
    });
    revalidate();
    return actionOk({ id: parsed.data });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "端末の有効化に失敗しました"));
  }
}

// ── 編集・状態遷移 ───────────────────────────────────────────────────────────

const updateInput = z.object({
  id: uuidSchema,
  name: z.string().min(1, "端末名を入力してください"),
  factoryId: z.number().int().positive("工場を選択してください"),
  location: z.string().optional(),
});

export type UpdateDeviceInput = z.infer<typeof updateInput>;

/** 端末情報（名称・場所・工場）を更新する。工場変更時はピン配置を解除。 */
export async function updateDevice(
  raw: UpdateDeviceInput,
): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;

  try {
    const device = await prisma.kioskDevice.findUnique({ where: { id: v.id } });
    if (!device) return actionError("対象の端末が見つかりません");
    const factoryChanged = device.factoryId !== v.factoryId;
    await prisma.kioskDevice.update({
      where: { id: v.id },
      data: {
        name: v.name.trim(),
        factoryId: v.factoryId,
        location: v.location?.trim() || null,
        // 工場をまたぐ移動はフロアマップのピンを外す（マップは工場単位）。
        ...(factoryChanged ? { floorMapId: null, mapX: null, mapY: null } : {}),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: v.id,
      before: {
        name: device.name,
        location: device.location,
        factoryId: device.factoryId,
      },
      after: {
        name: v.name.trim(),
        location: v.location?.trim() || null,
        factoryId: v.factoryId,
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "端末の更新に失敗しました"));
  }
}

async function transitionDevice(
  id: string,
  from: "ACTIVE" | "DISABLED",
  to: "ACTIVE" | "DISABLED",
  note: string,
): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
    });
    if (!device) return actionError("対象の端末が見つかりません");
    if (device.status !== from) {
      return actionError(`この端末は${note}できる状態ではありません`);
    }
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: { status: to },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      before: { status: device.status },
      after: { status: to },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, `端末の${note}に失敗しました`));
  }
}

/** 端末を一時無効化する（再有効化可）。 */
export async function disableDevice(id: string): Promise<ActionResult> {
  return transitionDevice(id, "ACTIVE", "DISABLED", "無効化");
}

/** 無効化した端末を再有効化する。 */
export async function enableDevice(id: string): Promise<ActionResult> {
  return transitionDevice(id, "DISABLED", "ACTIVE", "再有効化");
}

/** 端末を取り消す（トークン破棄・再登録が必要）。オープン中のセッションも失効。 */
export async function revokeDevice(id: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
    });
    if (!device) return actionError("対象の端末が見つかりません");
    if (device.status === "REVOKED") {
      return actionError("この端末は既に取り消し済みです");
    }
    const now = new Date();
    const openSessions = await prisma.kioskSession.findMany({
      where: { deviceId: parsed.data, revokedAt: null },
      select: { userId: true },
    });
    await prisma.$transaction([
      prisma.kioskDevice.update({
        where: { id: parsed.data },
        data: {
          status: "REVOKED",
          deviceTokenHash: null,
          deviceTokenExpiresAt: null,
          devicePublicKey: null,
          fingerprint: null,
          floorMapId: null,
          mapX: null,
          mapY: null,
        },
      }),
      prisma.kioskSession.updateMany({
        where: { deviceId: parsed.data, revokedAt: null },
        data: { revokedAt: now },
      }),
      // 管理者失効も利用履歴（LOGOUT）に残す
      prisma.kioskDeviceLog.createMany({
        data: openSessions.map((s) => ({
          deviceId: parsed.data,
          type: "LOGOUT" as const,
          userId: s.userId,
          source: "admin",
        })),
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      before: { status: device.status },
      after: { status: "REVOKED" },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "端末の取り消しに失敗しました"));
  }
}

/**
 * 端末設定画面（5タップ）の解錠コードを再生成する。
 * 新コードは戻り値で一度だけ通知表示する（監査にはコード値を残さない）。
 */
export async function regenerateSettingsCode(
  id: string,
): Promise<ActionResult<{ code: string }>> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { id: true },
    });
    if (!device) return actionError("対象の端末が見つかりません");
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: { settingsCode: code },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      after: { note: "端末設定コードを再生成" },
    });
    revalidate();
    return actionOk({ code });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "設定コードの再生成に失敗しました"),
    );
  }
}

/** アテステーション鍵をリセット（次回ラッパー接続時に再束縛 = TOFU）。 */
export async function resetDeviceKey(id: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { fingerprint: true },
    });
    if (!device) return actionError("対象の端末が見つかりません");
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: { devicePublicKey: null, fingerprint: null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      before: { fingerprint: device.fingerprint },
      after: { fingerprint: null },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "鍵のリセットに失敗しました"));
  }
}

// ── フロアマップ: ピン配置 ───────────────────────────────────────────────────

const placeInput = z.object({
  id: uuidSchema,
  floorMapId: uuidSchema,
  mapX: z.number().min(0).max(100),
  mapY: z.number().min(0).max(100),
});

/** 端末をフロアマップ上に配置する（%座標）。 */
export async function placeDevice(raw: {
  id: string;
  floorMapId: string;
  mapX: number;
  mapY: number;
}): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = placeInput.safeParse(raw);
  if (!parsed.success) return actionError("入力が不正です");
  const v = parsed.data;

  try {
    const [device, map] = await Promise.all([
      prisma.kioskDevice.findUnique({ where: { id: v.id } }),
      prisma.kioskFloorMap.findUnique({ where: { id: v.floorMapId } }),
    ]);
    if (!device) return actionError("対象の端末が見つかりません");
    if (!map || !map.isActive) {
      return actionError("対象のフロアマップが見つかりません");
    }
    if (device.factoryId !== map.factoryId) {
      return actionError("端末の所属工場とフロアマップの工場が一致しません");
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    await prisma.kioskDevice.update({
      where: { id: v.id },
      data: {
        floorMapId: v.floorMapId,
        mapX: round(v.mapX),
        mapY: round(v.mapY),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: v.id,
      after: {
        note: `フロアマップ「${map.name}」に配置（${round(v.mapX)}%, ${round(v.mapY)}%）`,
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "ピンの配置に失敗しました"));
  }
}

/** フロアマップ上のピンを外す。 */
export async function unplaceDevice(id: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { id: true },
    });
    if (!device) return actionError("対象の端末が見つかりません");
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: { floorMapId: null, mapX: null, mapY: null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      after: { note: "フロアマップのピンを解除" },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "ピンの解除に失敗しました"));
  }
}

// ── フロアマップ: 管理 ──────────────────────────────────────────────────────

const floorMapCreateInput = z.object({
  factoryId: z.number().int().positive("工場を選択してください"),
  name: z.string().min(1, "フロア名を入力してください"),
});

/** フロアマップ（階/エリア）を追加する。 */
export async function createFloorMap(raw: {
  factoryId: number;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  const authz = await checkPermission("kiosk", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = floorMapCreateInput.safeParse(raw);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;

  try {
    const factory = await prisma.factory.findUnique({
      where: { id: v.factoryId },
      select: { isActive: true },
    });
    if (!factory || !factory.isActive) {
      return actionError("対象の工場が見つかりません");
    }
    const last = await prisma.kioskFloorMap.findFirst({
      where: { factoryId: v.factoryId, isActive: true },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const created = await prisma.kioskFloorMap.create({
      data: {
        factoryId: v.factoryId,
        name: v.name.trim(),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "kiosk_floor_maps",
      recordId: created.id,
      after: { name: v.name.trim(), factoryId: v.factoryId },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "フロアマップの作成に失敗しました"),
    );
  }
}

const floorMapRenameInput = z.object({
  id: uuidSchema,
  name: z.string().min(1, "フロア名を入力してください"),
});

/** フロアマップの名称を変更する。 */
export async function renameFloorMap(raw: {
  id: string;
  name: string;
}): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = floorMapRenameInput.safeParse(raw);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;

  try {
    const map = await prisma.kioskFloorMap.findUnique({ where: { id: v.id } });
    if (!map || !map.isActive) {
      return actionError("対象のフロアマップが見つかりません");
    }
    await prisma.kioskFloorMap.update({
      where: { id: v.id },
      data: { name: v.name.trim() },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_floor_maps",
      recordId: v.id,
      before: { name: map.name },
      after: { name: v.name.trim() },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "フロアマップの更新に失敗しました"),
    );
  }
}

/** フロアマップを削除する（端末が配置されていない場合のみ）。 */
export async function deleteFloorMap(id: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const map = await prisma.kioskFloorMap.findUnique({
      where: { id: parsed.data },
      include: {
        _count: { select: { devices: true } },
        file: { select: { id: true, storageKey: true } },
      },
    });
    if (!map) return actionError("対象のフロアマップが見つかりません");
    if (map._count.devices > 0) {
      return actionError(
        "端末が配置されているフロアマップは削除できません。先にピンを解除してください",
      );
    }
    await prisma.kioskFloorMap.delete({ where: { id: parsed.data } });
    // 図面画像は best-effort で掃除（他参照が残る場合は温存）。
    if (map.file) {
      const fileDeleted = await prisma.file
        .delete({ where: { id: map.file.id } })
        .then(() => true)
        .catch(() => false);
      if (fileDeleted) await deleteObject(map.file.storageKey);
    }
    await recordAudit({
      action: "DELETE",
      tableName: "kiosk_floor_maps",
      recordId: parsed.data,
      before: { name: map.name, factoryId: map.factoryId },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "フロアマップの削除に失敗しました"),
    );
  }
}

// ── フロアマップ: 図面画像 ───────────────────────────────────────────────────

/** 図面画像の最大サイズ（10MB）。 */
const MAX_MAP_IMAGE_BYTES = 10 * 1024 * 1024;

const MAP_IMAGE_TYPES: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
};

/** ストレージキー用にファイル名を無害化（attachments.ts と同規約）。 */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return (safe || "file").slice(0, 80);
}

/**
 * 図面画像をアップロードして差し替える（FormData: `file`）。
 * SeaweedFS `kiosk/floor-maps/{uuid}-{name}` + files 行 —
 * lib/attachments.ts の保存フローと同じ規約。旧画像は best-effort で削除。
 */
export async function uploadFloorMapImage(
  mapId: string,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsedId = uuidSchema.safeParse(mapId);
  if (!parsedId.success) return actionError("入力が不正です");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return actionError("画像ファイルを選択してください");
  }
  if (file.size > MAX_MAP_IMAGE_BYTES) {
    return actionError("画像サイズは 10MB 以下にしてください");
  }
  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const allowed = MAP_IMAGE_TYPES[ext];
  if (!allowed || !allowed.includes(file.type.toLowerCase())) {
    return actionError("対応していない画像形式です（PNG / JPG / WEBP / SVG）");
  }

  try {
    const map = await prisma.kioskFloorMap.findUnique({
      where: { id: parsedId.data },
      include: { file: { select: { id: true, storageKey: true } } },
    });
    if (!map || !map.isActive) {
      return actionError("対象のフロアマップが見つかりません");
    }

    const bytes = await file.arrayBuffer();
    const storageKey = `kiosk/floor-maps/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
    if (!(await putObject(storageKey, bytes, allowed[0]))) {
      return actionError("ストレージへの保存に失敗しました");
    }

    const actor = await getCurrentActorId();
    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.file.create({
          data: {
            storageKey,
            filename: file.name,
            mimeType: allowed[0],
            sizeBytes: BigInt(bytes.byteLength),
            uploadedBy: actor,
          },
          select: { id: true },
        });
        await tx.kioskFloorMap.update({
          where: { id: parsedId.data },
          data: { fileId: created.id },
        });
      });
    } catch (e) {
      await deleteObject(storageKey); // DB 失敗時は孤児を掃除
      throw e;
    }

    // 旧画像は best-effort で削除（他参照が残る場合は温存）。
    if (map.file) {
      const fileDeleted = await prisma.file
        .delete({ where: { id: map.file.id } })
        .then(() => true)
        .catch(() => false);
      if (fileDeleted) await deleteObject(map.file.storageKey);
    }

    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_floor_maps",
      recordId: parsedId.data,
      after: { note: `図面画像を更新: ${file.name}` },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "図面画像の更新に失敗しました"));
  }
}
