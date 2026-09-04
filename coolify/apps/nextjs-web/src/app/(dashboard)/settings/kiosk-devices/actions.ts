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
 *   名称・拠点・場所・フロアマップのピンを保ったまま再リンクできる。
 */

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { checkFloorMapPermission as checkFloorMapPermissionCore } from "@/lib/floor-map-image";
import { LOCALES } from "@/lib/i18n";
import {
  type KioskDeviceSessionRow,
  type KioskPresenceRow,
  listDeviceSessions,
  listKioskPresence,
} from "@/lib/kiosk-admin";
import { mintMonitorToken } from "@/lib/kiosk-ws-token";
import {
  checkOperationPermission,
  elevationAuditNote,
  useElevation,
} from "@/lib/privileged-access";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";
import { deleteObject } from "@/lib/storage";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

const BASE_PATH = "/settings/kiosk-devices";

function uuidSchema(tr: Tr) {
  return z.string().uuid(tr("settings.kioskDevicesActions.invalidTarget"));
}

function revalidate() {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/map`);
  // フロアマップは MS0C（拠点詳細）/ PD04（在庫管理）とも共用
  revalidatePath("/master/plants");
  revalidatePath("/production/inventory");
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
  const tr = await getTranslations();
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) return actionError(authz.error);
  try {
    return actionOk({ devices: await listKioskPresence() });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.kioskDevicesActions.fetchFailed"), tr),
    );
  }
}

/** 端末の利用履歴（kiosk_device_logs）をページ取得する。 */
export async function fetchDeviceSessions(
  deviceId: string,
  cursor?: string,
): Promise<
  ActionResult<{ rows: KioskDeviceSessionRow[]; nextCursor: string | null }>
> {
  const tr = await getTranslations();
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema(tr).safeParse(deviceId);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  try {
    return actionOk(await listDeviceSessions(parsed.data, cursor));
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.fetchSessionsFailed"),
        tr,
      ),
    );
  }
}

// ── プロファイル作成・リンク ────────────────────────────────────────────────

function createProfileInputSchema(tr: Tr) {
  return z.object({
    // 端末名は多言語（{ ja, en }）。英語未入力なら日本語で埋める。
    nameJa: z
      .string()
      .min(1, tr("settings.kioskDevicesActions.enterDeviceName")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    plantId: z.number().int().positive(tr("master.locationModal.selectASite")),
    location: z.string().optional(),
  });
}

export type CreateDeviceProfileInput = z.infer<
  ReturnType<typeof createProfileInputSchema>
>;

/**
 * 端末プロファイルを作成する（PENDING = オープン）。
 * タブレット側 /setup のコードを「端末をリンク」で入力/スキャンしてリンクする。
 */
export async function createDeviceProfile(
  raw: CreateDeviceProfileInput,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  // 特権操作の順序は 検証 → 素の権限 → 対象の確認 → useElevation → 実処理。
  // useElevation は初回に申請者の時計を動かし use_count を増やすので、不正な
  // 入力や存在しない対象で先に呼ばない（何もしていないのに持ち時間が減る）。
  const parsed = createProfileInputSchema(tr).safeParse(raw);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const pre = await checkOperationPermission("kiosk_device.create_profile");
  if (!pre.ok) return actionError(pre.error);

  try {
    const plant = await prisma.plant.findUnique({
      where: { id: v.plantId },
      select: { isActive: true },
    });
    if (!plant || !plant.isActive) {
      return actionError(tr("settings.kioskDevicesActions.plantNotFound"));
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_device.create_profile");
    if (!gate.ok) return actionError(gate.error);
    const name = localizedInput(v.nameJa, undefined, v.nameTranslations);
    const created = await prisma.kioskDevice.create({
      data: {
        status: "PENDING",
        name,
        plantId: v.plantId,
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
        name,
        plantId: v.plantId,
        location: v.location?.trim() || null,
        ...elevationAuditNote(gate, "kiosk_device.create_profile"),
      },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.createProfileFailed"),
        tr,
      ),
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
  const tr = await getTranslations();
  const parsedId = uuidSchema(tr).safeParse(profileId);
  if (!parsedId.success) return actionError(tr("common.invalidInput"));
  const normalized = normalizeCode(code);
  if (normalized.length !== 12) {
    return actionError(tr("settings.kiosk.enterA12CharacterCode"));
  }
  const pre = await checkOperationPermission("kiosk_device.link");
  if (!pre.ok) return actionError(pre.error);

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsedId.data },
      select: { status: true },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.profileNotFound"));
    if (device.status !== "PENDING") {
      return actionError(
        tr("settings.kioskDevicesActions.onlyOpenProfileCanLink"),
      );
    }
    const now = new Date();
    const request = await prisma.kioskLinkRequest.findFirst({
      where: { code: normalized, deviceId: null, expiresAt: { gt: now } },
      select: { id: true, userAgent: true, lastIpAddress: true },
    });
    if (!request) {
      return actionError(
        tr("settings.kioskDevicesActions.codeInvalidOrExpired"),
      );
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_device.link");
    if (!gate.ok) return actionError(gate.error);
    // コードの「まだ誰にも結ばれていない」は読んだ瞬間の話。同じコードを 2 人が
    // 同時に読み取ると両方が通るので、結ぶのは条件付き UPDATE にして 0 件なら負け。
    const bound = await prisma.$transaction(async (tx) => {
      const claimed = await tx.kioskLinkRequest.updateMany({
        where: { id: request.id, deviceId: null },
        data: { deviceId: parsedId.data },
      });
      if (claimed.count === 0) return false;
      await tx.kioskDevice.update({
        where: { id: parsedId.data },
        data: {
          status: "LINKED",
          linkedAt: now,
          userAgent: request.userAgent,
          lastIpAddress: request.lastIpAddress,
        },
      });
      return true;
    });
    if (!bound) {
      return actionError(
        tr("settings.kioskDevicesActions.codeInvalidOrExpired"),
      );
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsedId.data,
      before: { status: "PENDING" },
      after: {
        status: "LINKED",
        note: tr("settings.kioskDevicesActions.auditLinkedTablet"),
        ...elevationAuditNote(gate, "kiosk_device.link"),
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.kioskDevicesActions.linkFailed"), tr),
    );
  }
}

/**
 * リンク解除 — 物理端末をプロファイルから切り離してオープン（PENDING）に戻す。
 * 名称・拠点・場所・フロアマップのピンは保持。セッション・デバイストークン・
 * アテステーション鍵は破棄する（端末の交換・故障時に再リンクするため）。
 */
export async function unlinkDevice(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const parsed = uuidSchema(tr).safeParse(id);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  const pre = await checkOperationPermission("kiosk_device.unlink");
  if (!pre.ok) return actionError(pre.error);

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { status: true },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
    if (
      device.status !== "LINKED" &&
      device.status !== "ACTIVE" &&
      device.status !== "DISABLED"
    ) {
      return actionError(
        tr("settings.kioskDevicesActions.cannotUnlinkInThisState"),
      );
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_device.unlink");
    if (!gate.ok) return actionError(gate.error);
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
      after: {
        status: "PENDING",
        note: tr("settings.kioskDevicesActions.auditUnlinked"),
        ...elevationAuditNote(gate, "kiosk_device.unlink"),
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.unlinkFailed"),
        tr,
      ),
    );
  }
}

/** 端末プロファイルを削除する（リンク前 = PENDING のみ。ハード削除）。 */
export async function deleteDeviceProfile(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("kiosk", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema(tr).safeParse(id);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { status: true, name: true, plantId: true },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.profileNotFound"));
    if (device.status !== "PENDING") {
      return actionError(
        tr("settings.kioskDevicesActions.linkedOrActivatedCannotDelete"),
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
        plantId: device.plantId,
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.deleteProfileFailed"),
        tr,
      ),
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
  const tr = await getTranslations();
  const parsed = uuidSchema(tr).safeParse(id);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  const pre = await checkOperationPermission("kiosk_device.activate");
  if (!pre.ok) return actionError(pre.error);

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { status: true },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.profileNotFound"));
    if (device.status === "PENDING") {
      return actionError(
        tr("settings.kioskDevicesActions.notLinkedCannotActivate"),
      );
    }
    if (device.status === "ACTIVE") {
      return actionError(tr("settings.kioskDevicesActions.alreadyActive"));
    }
    if (device.status !== "LINKED") {
      return actionError(
        tr("settings.kioskDevicesActions.cannotActivateInThisState"),
      );
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_device.activate");
    if (!gate.ok) return actionError(gate.error);
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: {
        status: "ACTIVE",
        activatedById: gate.userId,
        activatedAt: new Date(),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      before: { status: "LINKED" },
      after: {
        status: "ACTIVE",
        ...elevationAuditNote(gate, "kiosk_device.activate"),
      },
    });
    revalidate();
    return actionOk({ id: parsed.data });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.activateFailed"),
        tr,
      ),
    );
  }
}

// ── 編集・状態遷移 ───────────────────────────────────────────────────────────

function updateInputSchema(tr: Tr) {
  return z.object({
    id: uuidSchema(tr),
    // 端末名は多言語（{ ja, en }）。英語未入力なら日本語で埋める。
    nameJa: z
      .string()
      .min(1, tr("settings.kioskDevicesActions.enterDeviceName")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    plantId: z.number().int().positive(tr("master.locationModal.selectASite")),
    location: z.string().optional(),
    // 既定の作業場所（任意）。工程の開始/再開時に実績へ自動記録される。
    defaultWorkLocationId: z.number().int().positive().nullable(),
    // ログイン前画面（/login 等）の表示言語。null = 既定（ja）。
    locale: z.enum(LOCALES).nullable(),
  });
}

export type UpdateDeviceInput = z.infer<ReturnType<typeof updateInputSchema>>;

/** 端末情報（名称・場所・拠点・既定作業場所）を更新する。拠点変更時はピン配置を解除。 */
export async function updateDevice(
  raw: UpdateDeviceInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = updateInputSchema(tr).safeParse(raw);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;

  try {
    const device = await prisma.kioskDevice.findUnique({ where: { id: v.id } });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
    const plantChanged = device.plantId !== v.plantId;
    if (v.defaultWorkLocationId != null) {
      // 既定作業場所は端末の拠点の作業場所（or 拠点未指定グループ）に限る。
      const location = await prisma.workLocation.findFirst({
        where: {
          id: v.defaultWorkLocationId,
          isActive: true,
          group: {
            isActive: true,
            OR: [{ plantId: v.plantId }, { plantId: null }],
          },
        },
        select: { id: true },
      });
      if (!location) {
        return actionError(
          tr("settings.kioskDevicesActions.defaultWorkLocationMismatch"),
        );
      }
    }
    const name = localizedInput(v.nameJa, undefined, v.nameTranslations);
    await prisma.kioskDevice.update({
      where: { id: v.id },
      data: {
        name,
        plantId: v.plantId,
        location: v.location?.trim() || null,
        defaultWorkLocationId: v.defaultWorkLocationId,
        locale: v.locale,
        // 拠点をまたぐ移動はフロアマップのピンを外す（マップは拠点単位）。
        ...(plantChanged ? { floorMapId: null, mapX: null, mapY: null } : {}),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: v.id,
      before: {
        name: device.name,
        location: device.location,
        plantId: device.plantId,
        defaultWorkLocationId: device.defaultWorkLocationId,
        locale: device.locale,
      },
      after: {
        name,
        location: v.location?.trim() || null,
        plantId: v.plantId,
        defaultWorkLocationId: v.defaultWorkLocationId,
        locale: v.locale,
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.updateFailed"),
        tr,
      ),
    );
  }
}

async function transitionDevice(
  tr: Tr,
  id: string,
  from: "ACTIVE" | "DISABLED",
  to: "ACTIVE" | "DISABLED",
  note: string,
): Promise<ActionResult> {
  const parsed = uuidSchema(tr).safeParse(id);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  const pre = await checkOperationPermission("kiosk_device.set_enabled");
  if (!pre.ok) return actionError(pre.error);

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
    if (device.status !== from) {
      return actionError(
        tr("settings.kioskDevicesActions.cannotTransitionInThisState", {
          action: note,
        }),
      );
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_device.set_enabled");
    if (!gate.ok) return actionError(gate.error);
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: { status: to },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      before: { status: device.status },
      after: {
        status: to,
        ...elevationAuditNote(gate, "kiosk_device.set_enabled"),
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.transitionFailed", { action: note }),
        tr,
      ),
    );
  }
}

/** 端末を一時無効化する（再有効化可）。 */
export async function disableDevice(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  return transitionDevice(tr, id, "ACTIVE", "DISABLED", tr("common.disable"));
}

/** 無効化した端末を再有効化する。 */
export async function enableDevice(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  return transitionDevice(
    tr,
    id,
    "DISABLED",
    "ACTIVE",
    tr("settings.kiosk.reEnable"),
  );
}

/** 端末を取り消す（トークン破棄・再登録が必要）。オープン中のセッションも失効。 */
export async function revokeDevice(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const parsed = uuidSchema(tr).safeParse(id);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  const pre = await checkOperationPermission("kiosk_device.revoke");
  if (!pre.ok) return actionError(pre.error);

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
    if (device.status === "REVOKED") {
      return actionError(tr("settings.kioskDevicesActions.alreadyRevoked"));
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_device.revoke");
    if (!gate.ok) return actionError(gate.error);
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
      after: {
        status: "REVOKED",
        ...elevationAuditNote(gate, "kiosk_device.revoke"),
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.revokeFailed"),
        tr,
      ),
    );
  }
}

/**
 * 端末設定画面（5タップ）の解錠コードを再生成する。
 * 新コードは戻り値で一度だけ通知表示する（監査にはコード値を残さない）。
 */
export async function regenerateSettingsCode(
  id: string,
): Promise<ActionResult<{ code: string }>> {
  const tr = await getTranslations();
  const parsed = uuidSchema(tr).safeParse(id);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  const pre = await checkOperationPermission(
    "kiosk_secret.regenerate_settings_code",
  );
  if (!pre.ok) return actionError(pre.error);

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { id: true },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_secret.regenerate_settings_code");
    if (!gate.ok) return actionError(gate.error);
    // 解錠コードは秘密なので CSPRNG から引く（Math.random は予測できる）。
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: { settingsCode: code },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      after: {
        note: tr("settings.kioskDevicesActions.auditSettingsCodeRegenerated"),
        ...elevationAuditNote(gate, "kiosk_secret.regenerate_settings_code"),
      },
    });
    revalidate();
    return actionOk({ code });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.regenerateSettingsCodeFailed"),
        tr,
      ),
    );
  }
}

/**
 * PIN / 設定コードの開示（SY09 端末詳細 — 表示前に確認 + 監査ログ記録）。
 * kind = "unlock": メンテナンス退出 PIN（全端末共通・毎日 4:00 に自動更新 —
 *   system_settings kiosk.unlock_pin。端末側は 1 時間ごと + ダイアログ表示時に同期）。
 * kind = "settings": 端末設定コード（端末ごと・左下 5 タップ画面の解錠用）。
 */
export async function revealKioskPin(input: {
  kind: "unlock" | "settings";
  deviceId?: string;
}): Promise<ActionResult<{ value: string }>> {
  const tr = await getTranslations();
  // 開示するものが違えば別の操作。設定コード（端末 1 台の解錠）と退出 PIN
  // （全端末共通）では影響範囲が桁で違うので、まとめて 1 つの承認にしない。
  try {
    if (input.kind === "settings") {
      // 端末の指定と存在を先に確かめる — 不正な呼び出しで時計を動かさない。
      const parsed = uuidSchema(tr).safeParse(input.deviceId);
      if (!parsed.success)
        return actionError(
          tr("settings.kioskDevicesActions.deviceNotSpecified"),
        );
      const pre = await checkOperationPermission(
        "kiosk_secret.reveal_settings_code",
      );
      if (!pre.ok) return actionError(pre.error);
      const device = await prisma.kioskDevice.findUnique({
        where: { id: parsed.data },
        select: { settingsCode: true },
      });
      if (!device)
        return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
      // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
      const gate = await useElevation("kiosk_secret.reveal_settings_code");
      if (!gate.ok) return actionError(gate.error);
      await recordAudit({
        action: "VIEW",
        tableName: "kiosk_devices",
        recordId: parsed.data,
        after: {
          note: tr("settings.kioskDevicesActions.auditSettingsCodeRevealed"),
          ...elevationAuditNote(gate, "kiosk_secret.reveal_settings_code"),
        },
      });
      return actionOk({ value: device.settingsCode });
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_secret.reveal_unlock_pin");
    if (!gate.ok) return actionError(gate.error);
    const row = await prisma.systemSetting.findUnique({
      where: { key: "kiosk.unlock_pin" },
    });
    const value = typeof row?.value === "string" ? row.value : null;
    if (!value)
      return actionError(
        tr("settings.kioskDevicesActions.maintenancePinNotSet"),
      );
    await recordAudit({
      action: "VIEW",
      tableName: "system_settings",
      recordId: "kiosk.unlock_pin",
      after: {
        note: tr("settings.kioskDevicesActions.auditUnlockPinRevealed"),
        ...elevationAuditNote(gate, "kiosk_secret.reveal_unlock_pin"),
      },
    });
    return actionOk({ value });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.pinFetchFailed"),
        tr,
      ),
    );
  }
}

/**
 * 過去のメンテナンス PIN 1 件（有効だった期間つき）。
 * 時刻は ISO 文字列（kiosk-admin.ts と同じ規約 — Date のままクライアントへ
 * 渡すと表示側で string と混ざる）。
 */
export type UnlockPinHistoryRow = {
  pin: string;
  /** この PIN が有効になった時刻 */
  rotatedAt: string;
  /** 次の更新で置き換わった時刻。null = 現行値 */
  supersededAt: string | null;
};

/**
 * メンテナンス退出 PIN の履歴（SY09 端末詳細 — 表示前に確認 + 監査ログ記録）。
 *
 * 端末は PIN をローカルに持つ（PinSync → SharedPreferences）ので、**オフラインの
 * 端末が受け付けるのは現行値ではなく「最後に同期できた時点の値」**。回線の切れた
 * 端末を開けるときは、その端末が最後にオンラインだった時刻（端末詳細の最終通信）を
 * 見て、その時刻を含む行の PIN を使う。
 *
 * 保持期間は 400 日（刈り取りは kiosk-cron.sql の rotate ジョブ）。それより古い
 * 端末は PIN では開かないので、ADB か再プロビジョニングになる。
 */
export async function listUnlockPinHistory(): Promise<
  ActionResult<{ rows: UnlockPinHistoryRow[] }>
> {
  const tr = await getTranslations();
  const gate = await useElevation("kiosk_secret.reveal_pin_history");
  if (!gate.ok) return actionError(gate.error);
  try {
    const rows = await prisma.kioskUnlockPin.findMany({
      orderBy: { rotatedAt: "desc" },
      select: { pin: true, rotatedAt: true },
      take: 400,
    });
    await recordAudit({
      action: "VIEW",
      tableName: "kiosk_unlock_pins",
      recordId: "kiosk.unlock_pin",
      after: {
        note: tr("settings.kioskDevicesActions.auditUnlockPinHistoryRevealed"),
        count: rows.length,
        ...elevationAuditNote(gate, "kiosk_secret.reveal_pin_history"),
      },
    });
    return actionOk({
      rows: rows.map((row, i) => ({
        pin: row.pin,
        rotatedAt: row.rotatedAt.toISOString(),
        // 降順なので 1 つ前の行の rotatedAt がこの PIN の終わり
        supersededAt:
          i === 0 ? null : (rows[i - 1]?.rotatedAt.toISOString() ?? null),
      })),
    });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.pinHistoryFetchFailed"),
        tr,
      ),
    );
  }
}

/** その端末がいま保持しているメンテナンス PIN。 */
export type DeviceUnlockPinInfo = {
  /**
   * 端末が保持している PIN。null = まだ一度も同期できていない、または同期は
   * したが当時の PIN が履歴に無い（履歴を入れる前に受け取った / 400 日を過ぎた）。
   */
  pin: string | null;
  /** 最後に PIN を受け取れた時刻。null = 一度も受け取れていない。 */
  syncedAt: string | null;
  /** 受け取った PIN が有効になった時刻。 */
  rotatedAt: string | null;
  /** その PIN が現行値と同じか（= 端末は最新を持っている）。 */
  isCurrent: boolean;
};

/**
 * 端末がいま保持しているメンテナンス PIN（SY09 端末詳細 — 確認 + 監査ログ記録）。
 *
 * 端末は PIN をローカルに持つ（PinSync → SharedPreferences）ので、オフラインの
 * 端末に現行 PIN を入れても開かない。ここは「その端末に最後に渡した PIN」を
 * 受け渡しの記録（kiosk_devices.unlock_pin_rotated_at）から引き当てて返す
 * — 最終通信時刻からの推測ではなく、実際に渡した記録に基づく。
 *
 * syncedAt が null のときは端末がビルド時の既定 PIN のままで、サーバー側には
 * その値が無い（APK のビルド設定にしかない）。
 */
export async function revealDeviceUnlockPin(
  deviceId: string,
): Promise<ActionResult<DeviceUnlockPinInfo>> {
  const tr = await getTranslations();
  const parsed = uuidSchema(tr).safeParse(deviceId);
  if (!parsed.success)
    return actionError(tr("settings.kioskDevicesActions.deviceNotSpecified"));
  const pre = await checkOperationPermission("kiosk_secret.reveal_device_pin");
  if (!pre.ok) return actionError(pre.error);
  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { unlockPinSyncedAt: true, unlockPinRotatedAt: true },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_secret.reveal_device_pin");
    if (!gate.ok) return actionError(gate.error);

    await recordAudit({
      action: "VIEW",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      after: {
        note: tr("settings.kioskDevicesActions.auditDevicePinRevealed"),
        ...elevationAuditNote(gate, "kiosk_secret.reveal_device_pin"),
      },
    });

    if (!device.unlockPinRotatedAt) {
      return actionOk({
        pin: null,
        syncedAt: device.unlockPinSyncedAt?.toISOString() ?? null,
        rotatedAt: null,
        isCurrent: false,
      });
    }
    const [held, current] = await Promise.all([
      prisma.kioskUnlockPin.findFirst({
        where: { rotatedAt: device.unlockPinRotatedAt },
        select: { pin: true },
      }),
      prisma.systemSetting.findUnique({ where: { key: "kiosk.unlock_pin" } }),
    ]);
    const currentPin =
      typeof current?.value === "string" ? current.value : null;
    return actionOk({
      pin: held?.pin ?? null,
      syncedAt: device.unlockPinSyncedAt?.toISOString() ?? null,
      rotatedAt: device.unlockPinRotatedAt.toISOString(),
      isCurrent: held?.pin != null && held.pin === currentPin,
    });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.pinFetchFailed"),
        tr,
      ),
    );
  }
}

/** アテステーション鍵をリセット（次回ラッパー接続時に再束縛 = TOFU）。 */
export async function resetDeviceKey(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const parsed = uuidSchema(tr).safeParse(id);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  const pre = await checkOperationPermission("kiosk_secret.reset_device_key");
  if (!pre.ok) return actionError(pre.error);

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { fingerprint: true },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const gate = await useElevation("kiosk_secret.reset_device_key");
    if (!gate.ok) return actionError(gate.error);
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: { devicePublicKey: null, fingerprint: null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      before: { fingerprint: device.fingerprint },
      after: {
        fingerprint: null,
        ...elevationAuditNote(gate, "kiosk_secret.reset_device_key"),
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.resetKeyFailed"),
        tr,
      ),
    );
  }
}

// ── フロアマップ: ピン配置 ───────────────────────────────────────────────────

function placeInputSchema(tr: Tr) {
  return z.object({
    id: uuidSchema(tr),
    floorMapId: uuidSchema(tr),
    mapX: z.number().min(0).max(100),
    mapY: z.number().min(0).max(100),
  });
}

/** 端末をフロアマップ上に配置する（%座標）。 */
export async function placeDevice(raw: {
  id: string;
  floorMapId: string;
  mapX: number;
  mapY: number;
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = placeInputSchema(tr).safeParse(raw);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  const v = parsed.data;

  try {
    const [device, map] = await Promise.all([
      prisma.kioskDevice.findUnique({ where: { id: v.id } }),
      prisma.kioskFloorMap.findUnique({ where: { id: v.floorMapId } }),
    ]);
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
    if (!map || !map.isActive) {
      return actionError(tr("settings.kioskDevicesActions.floorMapNotFound"));
    }
    if (device.plantId !== map.plantId) {
      return actionError(
        tr("settings.kioskDevicesActions.floorMapPlantMismatch"),
      );
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
        note: tr("settings.kioskDevicesActions.auditPlacedOnFloorMap", {
          name: map.name,
          x: round(v.mapX),
          y: round(v.mapY),
        }),
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.kioskDevicesActions.placeFailed"), tr),
    );
  }
}

/** フロアマップ上のピンを外す。 */
export async function unplaceDevice(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema(tr).safeParse(id);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  try {
    const device = await prisma.kioskDevice.findUnique({
      where: { id: parsed.data },
      select: { id: true },
    });
    if (!device)
      return actionError(tr("settings.kioskDevicesActions.deviceNotFound"));
    await prisma.kioskDevice.update({
      where: { id: parsed.data },
      data: { floorMapId: null, mapX: null, mapY: null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      after: {
        note: tr("settings.kioskDevicesActions.auditUnplacedFromFloorMap"),
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.unplaceFailed"),
        tr,
      ),
    );
  }
}

// ── フロアマップ: 管理 ──────────────────────────────────────────────────────

/**
 * フロアマップは端末管理 (SY09)・拠点マスタ (MS0C フロアマップタブ)・保管場所 (MS0E) で共用 —
 * kiosk / master どちらの権限でも管理できる。
 */
// 判定は lib/floor-map-image.ts と共用（API 経路と同じルールを使う）。
const checkFloorMapPermission = checkFloorMapPermissionCore;

function floorMapCreateInputSchema(tr: Tr) {
  return z.object({
    plantId: z.number().int().positive(tr("master.locationModal.selectASite")),
    name: z.string().min(1, tr("settings.kiosk.enterAFloorName")),
  });
}

/** フロアマップ（階/エリア）を追加する。 */
export async function createFloorMap(raw: {
  plantId: number;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const authz = await checkFloorMapPermission("CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = floorMapCreateInputSchema(tr).safeParse(raw);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;

  try {
    const plant = await prisma.plant.findUnique({
      where: { id: v.plantId },
      select: { isActive: true },
    });
    if (!plant || !plant.isActive) {
      return actionError(tr("settings.kioskDevicesActions.plantNotFound"));
    }
    const last = await prisma.kioskFloorMap.findFirst({
      where: { plantId: v.plantId, isActive: true },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const created = await prisma.kioskFloorMap.create({
      data: {
        plantId: v.plantId,
        name: v.name.trim(),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "kiosk_floor_maps",
      recordId: created.id,
      after: { name: v.name.trim(), plantId: v.plantId },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.createFloorMapFailed"),
        tr,
      ),
    );
  }
}

function floorMapRenameInputSchema(tr: Tr) {
  return z.object({
    id: uuidSchema(tr),
    name: z.string().min(1, tr("settings.kiosk.enterAFloorName")),
  });
}

/** フロアマップの名称を変更する。 */
export async function renameFloorMap(raw: {
  id: string;
  name: string;
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkFloorMapPermission("UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = floorMapRenameInputSchema(tr).safeParse(raw);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;

  try {
    const map = await prisma.kioskFloorMap.findUnique({ where: { id: v.id } });
    if (!map || !map.isActive) {
      return actionError(tr("settings.kioskDevicesActions.floorMapNotFound"));
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
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.renameFloorMapFailed"),
        tr,
      ),
    );
  }
}

/** フロアマップを削除する（端末が配置されていない場合のみ）。 */
export async function deleteFloorMap(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkFloorMapPermission("DELETE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = uuidSchema(tr).safeParse(id);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  try {
    const map = await prisma.kioskFloorMap.findUnique({
      where: { id: parsed.data },
      include: {
        _count: { select: { devices: true, storageLocations: true } },
        file: { select: { id: true, storageKey: true } },
      },
    });
    if (!map)
      return actionError(tr("settings.kioskDevicesActions.floorMapNotFound"));
    if (map._count.devices > 0) {
      return actionError(
        tr("settings.kioskDevicesActions.floorMapHasDevicesCannotDelete"),
      );
    }
    if (map._count.storageLocations > 0) {
      return actionError(
        tr(
          "settings.kioskDevicesActions.floorMapHasStorageLocationsCannotDelete",
        ),
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
      before: { name: map.name, plantId: map.plantId },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskDevicesActions.deleteFloorMapFailed"),
        tr,
      ),
    );
  }
}

// ── フロアマップ: 図面画像 ───────────────────────────────────────────────────
//
// 図面（〜10MB）のアップロードは **Server Action では受けられない**
// （ボディ既定 1MB 上限 → 自分のコードに届く前に 413）。保存処理は
// lib/floor-map-image.ts、入口は POST /api/floor-maps/[mapId]/image、
// クライアントからの呼び出しは lib/floor-map-client.ts にある。
