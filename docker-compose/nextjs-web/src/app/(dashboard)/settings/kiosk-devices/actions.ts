"use server";

/**
 * Server Actions — 端末管理（SY09, /settings/kiosk-devices）。
 *
 * キオスク端末プロファイル（app.kiosk_devices）の作成・リンクコード再発行・
 * 有効化・編集・無効化・取り消しと、フロアマップ（app.kiosk_floor_maps）の
 * 管理・ピン配置。全アクションを RBAC（kiosk）でゲートし、監査ログ
 * （audit_logs）を記録する。
 *
 * プロファイル先行の登録コントラクト（nextjs-kiosk /setup と対）:
 *   1. 管理者が本画面で端末プロファイルを作成（PENDING）→ リンクコード
 *      （Crockford 12桁・24時間期限）が本画面に表示される。
 *   2. タブレットの /setup がコードを入力/スキャン → kiosk API が LINKED 化。
 *   3. 管理者が LINKED の行のみ有効化（ACTIVE）→ タブレット側がポーリングで
 *      検知し自らデバイストークンを発行する。よってここではトークンには
 *      一切触れない。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { generateCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
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

// ── プロファイル作成・リンクコード ──────────────────────────────────────────

/** リンクコードの有効期間（24時間）。 */
const LINK_CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** Prisma の一意制約違反（コード衝突の検出に使用）。 */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "P2002"
  );
}

const createProfileInput = z.object({
  name: z.string().min(1, "端末名を入力してください"),
  factoryId: z.number().int().positive("工場を選択してください"),
  location: z.string().optional(),
});

export type CreateDeviceProfileInput = z.infer<typeof createProfileInput>;

/**
 * 端末プロファイルを作成する（PENDING + リンクコード発行）。
 * コードはタブレットの /setup で入力/スキャンしてリンクする。
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
    const data = () => ({
      status: "PENDING" as const,
      name: v.name.trim(),
      factoryId: v.factoryId,
      location: v.location?.trim() || null,
      registrationCode: generateCode(12),
      registrationExpiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
    });
    // コード衝突（unique 制約）は極めて稀 — 一度だけ再生成してリトライ。
    const created = await prisma.kioskDevice
      .create({ data: data(), select: { id: true } })
      .catch((e) => {
        if (!isUniqueViolation(e)) throw e;
        return prisma.kioskDevice.create({
          data: data(),
          select: { id: true },
        });
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

/** リンクコードを再発行する（PENDING のみ。新コード + 24時間期限）。 */
export async function regenerateLinkCode(id: string): Promise<ActionResult> {
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
    if (device.status !== "PENDING") {
      return actionError("リンク待ちの端末プロファイルのみ再発行できます");
    }
    const data = () => ({
      registrationCode: generateCode(12),
      registrationExpiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
    });
    await prisma.kioskDevice
      .update({ where: { id: parsed.data }, data: data() })
      .catch((e) => {
        if (!isUniqueViolation(e)) throw e;
        return prisma.kioskDevice.update({
          where: { id: parsed.data },
          data: data(),
        });
      });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_devices",
      recordId: parsed.data,
      after: { note: "リンクコードを再発行" },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, "リンクコードの再発行に失敗しました"),
    );
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
    await prisma.$transaction([
      prisma.kioskDevice.update({
        where: { id: parsed.data },
        data: {
          status: "REVOKED",
          deviceTokenHash: null,
          deviceTokenExpiresAt: null,
          registrationCode: null,
          registrationExpiresAt: null,
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
