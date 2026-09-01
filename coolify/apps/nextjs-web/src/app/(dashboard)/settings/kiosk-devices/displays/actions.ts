"use server";

/**
 * Server Actions — ディスプレイ（SY09 端末管理の「ディスプレイ」タブ）。
 *
 * **登録の流れは共有端末（タブレット）と同じ** profile-first:
 *   作る（PENDING）→ リンク（LINKED）→ 有効化（ACTIVE）→ 画面が自分で
 *   トークンを受け取る。端末とディスプレイで手順を変えないのは、
 *   覚えることを増やさないため。関数名と引数も kiosk-devices/actions.ts の
 *   対応する操作にそろえてある。
 *
 * **何を映すかは画面ごとに持つ。** 以前は「表示内容」を別レコードとして作って
 * から画面に結びつけていたが、掲示板は 1 枚ずつ違うもの（この壁は生産状況、
 * あの壁は出荷予定）を映すので、共有される表示内容はほぼ生まれなかった。
 * 結果、1 枚増やすたびに「表示内容を作る → 画面を作る → 結ぶ」の 3 手順を
 * 踏むことになっていた。いまは画面の設定として直接編集する。
 *
 * 権限の分け方（端末と同じ）:
 *   一覧・詳細・名称や設置場所の変更・表示内容の変更 … 素の `kiosk`
 *   リンク・有効化・リンク解除・失効                … 特権操作 `kiosk_device`
 *
 * 変更は必ず対象の画面へ合図を送る（lib/display-events.ts）。合図が落ちても
 * ディスプレイは自分の再取得間隔で追いつくので、送信の失敗で操作は倒さない。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { normalizeCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { DISPLAY_CONTENT_SCHEMAS } from "@/lib/display-content";
import {
  notifyDisplayConfigChanged,
  notifyDisplayRevoked,
} from "@/lib/display-events";
import { mintMonitorToken } from "@/lib/kiosk-ws-token";
import { useElevation } from "@/lib/privileged-access";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/settings/kiosk-devices";

function revalidate() {
  revalidatePath(BASE_PATH);
}

const uuidSchema = z.string().uuid();

const CONTENT_TYPES = ["APP_PAGE", "METABASE", "URL", "IMAGE"] as const;

/**
 * 種別に応じた content_config の検証。**保存と配信の両方でここを通す。**
 * 種別ごとに形が違う JSON なので DB では守れない。
 */
function validateConfig(
  contentType: (typeof CONTENT_TYPES)[number],
  config: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const schema = DISPLAY_CONTENT_SCHEMAS[contentType];
  const parsed = schema.safeParse(config ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "表示内容の設定が不正です",
    };
  }
  return { ok: true, value: parsed.data };
}

/** リンクコードの桁数。キオスク端末と同じ 12 桁（スキャナを 1 つに保つため）。 */
const LINK_CODE_LENGTH = 12;

// ── プレゼンス（WS モニター） ────────────────────────────────────────────────

/**
 * 管理 UI がディスプレイ WS にモニターとして繋ぐための短命トークン。
 * 秘密はキオスクと共用（KIOSK_WS_SECRET）— 同じサーバーの同じ口なので、
 * 鍵を増やしても守るものが増えない。
 */
export async function mintDisplayWsToken(): Promise<
  ActionResult<{ token: string | null }>
> {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) return actionError(authz.error);
  const secret = process.env.KIOSK_WS_SECRET;
  if (!secret) return actionOk({ token: null });
  return actionOk({ token: mintMonitorToken(secret) });
}

/** WS 不通時のフォールバック（一覧が 30 秒間隔で引く）。 */
export async function fetchDisplayPresence(): Promise<
  ActionResult<
    Array<{ id: string; isOnline: boolean; lastSeenAt: string | null }>
  >
> {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) return actionError(authz.error);
  const rows = await prisma.displayDevice.findMany({
    where: { status: { in: ["ACTIVE", "DISABLED"] } },
    select: { id: true, status: true, lastSeenAt: true },
  });
  const now = Date.now();
  return actionOk(
    rows.map((r) => ({
      id: r.id,
      isOnline:
        r.status === "ACTIVE" &&
        r.lastSeenAt != null &&
        now - r.lastSeenAt.getTime() < 5 * 60 * 1000,
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    })),
  );
}

// ── ① プロファイルを作る（ハードウェアより先） ───────────────────────────────

const createSchema = z.object({
  nameJa: z.string().trim().min(1, "名前を入力してください"),
  nameEn: z.string().trim().optional(),
  location: z.string().trim().optional(),
  plantId: z.number().int().positive().nullable().optional(),
  /**
   * 何を映すか。**省略できる** — 省略すると DB の既定（生産状況）が入る。
   * 「作ってすぐ何か映る」ようにしておくのは、設置の日に表示内容まで
   * 決まっていないことが普通にあるため。真っ黒な画面を作らない。
   */
  contentType: z.enum(CONTENT_TYPES).optional(),
  contentConfig: z.unknown().optional(),
  refreshIntervalSec: z.number().int().min(0).max(86_400).optional(),
});

/**
 * ディスプレイのプロファイルを作る。**この時点ではまだ画面と結びついていない**
 * （PENDING = オープン）。端末側の createDeviceProfile と同じ位置づけ。
 */
export async function createDisplayDevice(raw: {
  nameJa: string;
  nameEn?: string;
  location?: string;
  plantId?: number | null;
  contentType?: (typeof CONTENT_TYPES)[number];
  contentConfig?: unknown;
  refreshIntervalSec?: number;
}): Promise<ActionResult<{ id: string }>> {
  const authz = await checkPermission("kiosk", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const {
    nameJa,
    nameEn,
    location,
    plantId,
    contentType,
    contentConfig,
    refreshIntervalSec,
  } = parsed.data;

  // 表示内容は「渡されたときだけ」検証して入れる。渡さなければ DB の既定。
  let content: object = {};
  if (contentType) {
    const config = validateConfig(contentType, contentConfig);
    if (!config.ok) return actionError(config.error);
    content = { contentType, contentConfig: config.value as object };
  }

  try {
    const created = await prisma.displayDevice.create({
      data: {
        name: localizedInput(nameJa, nameEn),
        location: location || null,
        plantId: plantId ?? null,
        status: "PENDING",
        ...content,
        ...(refreshIntervalSec === undefined ? {} : { refreshIntervalSec }),
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "display_devices",
      recordId: created.id,
      after: {
        name: nameJa,
        location: location || null,
        status: "PENDING",
        ...content,
      },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "作成に失敗しました"));
  }
}

// ── ② リンク（画面が出したコードをオープンなプロファイルへ結ぶ） ─────────────

/**
 * 画面のリンクコードをオープン（PENDING）なプロファイルへ結ぶ。
 * 端末側の linkDeviceToProfile と同じ形・同じ不変条件。
 */
export async function linkDisplayToProfile(
  displayId: string,
  code: string,
): Promise<ActionResult> {
  const gate = await useElevation("kiosk_device.pair_display");
  if (!gate.ok) return actionError(gate.error);
  if (!uuidSchema.safeParse(displayId).success) {
    return actionError("入力が不正です");
  }
  const normalized = normalizeCode(code);
  if (normalized.length !== LINK_CODE_LENGTH) {
    return actionError("リンクコードは 12 文字です");
  }

  try {
    const device = await prisma.displayDevice.findUnique({
      where: { id: displayId },
      select: { status: true },
    });
    if (!device) return actionError("対象のディスプレイが見つかりません");
    if (device.status !== "PENDING") {
      return actionError(
        "オープンな（未リンクの）プロファイルにのみリンクできます",
      );
    }

    const request = await prisma.displayLinkRequest.findFirst({
      where: {
        code: normalized,
        deviceId: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userAgent: true, lastIpAddress: true },
    });
    if (!request) {
      return actionError(
        "リンクコードが見つからないか、有効期限が切れています。画面に出ている新しいコードを読み取ってください",
      );
    }

    await prisma.$transaction([
      prisma.displayLinkRequest.update({
        where: { id: request.id },
        data: { deviceId: displayId },
      }),
      prisma.displayDevice.update({
        where: { id: displayId },
        data: {
          status: "LINKED",
          linkedAt: new Date(),
          userAgent: request.userAgent,
          lastIpAddress: request.lastIpAddress,
        },
      }),
    ]);

    await recordAudit({
      action: "UPDATE",
      tableName: "display_devices",
      recordId: displayId,
      before: { status: "PENDING" },
      after: {
        status: "LINKED",
        bypass: gate.viaAdmin ? "admin" : undefined,
        grantId: gate.grantId ?? undefined,
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "リンクに失敗しました"));
  }
}

// ── ③ 有効化 ────────────────────────────────────────────────────────────────

/**
 * 有効化。**トークンはここでは作らない** — 画面側の confirm ポーリングが
 * 自分で受け取る（端末と同じ。管理画面が端末の秘密に触らない）。
 */
export async function activateDisplay(id: string): Promise<ActionResult> {
  const gate = await useElevation("kiosk_device.pair_display");
  if (!gate.ok) return actionError(gate.error);
  if (!uuidSchema.safeParse(id).success) return actionError("入力が不正です");

  try {
    const device = await prisma.displayDevice.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!device) return actionError("対象のディスプレイが見つかりません");
    if (device.status === "PENDING") {
      return actionError("リンクされていないプロファイルは有効化できません");
    }
    if (device.status === "ACTIVE") {
      return actionError("このディスプレイは既に有効です");
    }
    if (device.status !== "LINKED") {
      return actionError("このディスプレイは有効化できる状態ではありません");
    }

    await prisma.displayDevice.update({
      where: { id },
      data: {
        status: "ACTIVE",
        activatedById: gate.userId,
        activatedAt: new Date(),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "display_devices",
      recordId: id,
      before: { status: "LINKED" },
      after: {
        status: "ACTIVE",
        bypass: gate.viaAdmin ? "admin" : undefined,
        grantId: gate.grantId ?? undefined,
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "有効化に失敗しました"));
  }
}

// ── 変更（素の kiosk 権限） ──────────────────────────────────────────────────

const updateSchema = createSchema.extend({
  id: z.string().uuid(),
  /** 表示倍率（%）。範囲は DB の CHECK と同じ 50〜200。 */
  scalePercent: z.number().int().min(50).max(200).optional(),
});

export async function updateDisplay(raw: {
  id: string;
  nameJa: string;
  nameEn?: string;
  location?: string;
  plantId?: number | null;
  contentType?: (typeof CONTENT_TYPES)[number];
  contentConfig?: unknown;
  refreshIntervalSec?: number;
  scalePercent?: number;
}): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const {
    id,
    nameJa,
    nameEn,
    location,
    plantId,
    contentType,
    contentConfig,
    refreshIntervalSec,
    scalePercent,
  } = parsed.data;

  // 名前だけ直す画面からも呼ばれるので、渡された項目だけを触る。
  let content: object = {};
  if (contentType) {
    const config = validateConfig(contentType, contentConfig);
    if (!config.ok) return actionError(config.error);
    content = { contentType, contentConfig: config.value as object };
  }

  try {
    const before = await prisma.displayDevice.findUnique({
      where: { id },
      select: {
        name: true,
        location: true,
        plantId: true,
        contentType: true,
        contentConfig: true,
        refreshIntervalSec: true,
        scalePercent: true,
      },
    });
    if (!before) return actionError("対象のディスプレイが見つかりません");

    await prisma.displayDevice.update({
      where: { id },
      data: {
        name: localizedInput(nameJa, nameEn),
        location: location || null,
        plantId: plantId ?? null,
        ...content,
        ...(refreshIntervalSec === undefined ? {} : { refreshIntervalSec }),
        ...(scalePercent === undefined ? {} : { scalePercent }),
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "display_devices",
      recordId: id,
      before,
      after: {
        name: nameJa,
        location: location || null,
        plantId: plantId ?? null,
        ...content,
        refreshIntervalSec: refreshIntervalSec ?? before.refreshIntervalSec,
        scalePercent: scalePercent ?? before.scalePercent,
      },
    });
    // 映るものが変わったなら、その場で画面へ反映する（待たせない）
    const contentChanged =
      (contentType !== undefined && contentType !== before.contentType) ||
      (contentType !== undefined &&
        JSON.stringify(
          (content as { contentConfig?: unknown }).contentConfig,
        ) !== JSON.stringify(before.contentConfig)) ||
      (refreshIntervalSec !== undefined &&
        refreshIntervalSec !== before.refreshIntervalSec) ||
      (scalePercent !== undefined && scalePercent !== before.scalePercent);
    if (contentChanged) await notifyDisplayConfigChanged(id);
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "更新に失敗しました"));
  }
}

/** 一時停止 / 再開。停止はアクセスを減らす操作なので承認を待たせない。 */
export async function setDisplayEnabled(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!uuidSchema.safeParse(id).success) return actionError("入力が不正です");

  try {
    const before = await prisma.displayDevice.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!before) return actionError("対象のディスプレイが見つかりません");
    if (before.status === "REVOKED") {
      return actionError("失効したディスプレイは操作できません");
    }
    if (before.status === "PENDING" || before.status === "LINKED") {
      return actionError("有効化前のディスプレイは停止できません");
    }
    const next = enabled ? "ACTIVE" : "DISABLED";
    if (before.status === next) return actionOk();

    await prisma.displayDevice.update({
      where: { id },
      data: { status: next },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "display_devices",
      recordId: id,
      before: { status: before.status },
      after: { status: next },
    });
    // 停止したら画面を登録待ちに戻す（映したままにしない）
    await (enabled ? notifyDisplayConfigChanged(id) : notifyDisplayRevoked(id));
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "更新に失敗しました"));
  }
}

// ── リンク解除 / 失効（特権操作） ────────────────────────────────────────────

/**
 * リンク解除。トークンを破棄してプロファイルをオープン（PENDING）に戻す。
 * **名称・設置場所・表示内容は残す** — 壊れた Pi を差し替えるとき、
 * 同じ設定へ新しいハードウェアを結び直せるようにするため（端末と同じ）。
 */
export async function unlinkDisplay(id: string): Promise<ActionResult> {
  const gate = await useElevation("kiosk_device.revoke_display");
  if (!gate.ok) return actionError(gate.error);
  if (!uuidSchema.safeParse(id).success) return actionError("入力が不正です");

  try {
    const before = await prisma.displayDevice.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!before) return actionError("対象のディスプレイが見つかりません");
    if (before.status === "PENDING") {
      return actionError("このプロファイルはまだリンクされていません");
    }

    await prisma.$transaction([
      prisma.displayDevice.update({
        where: { id },
        data: {
          status: "PENDING",
          linkedAt: null,
          activatedAt: null,
          activatedById: null,
          deviceTokenHash: null,
          deviceTokenExpiresAt: null,
          userAgent: null,
          lastIpAddress: null,
          lastSeenAt: null,
        },
      }),
      prisma.displayLinkRequest.deleteMany({ where: { deviceId: id } }),
    ]);

    await recordAudit({
      action: "UPDATE",
      tableName: "display_devices",
      recordId: id,
      before: { status: before.status },
      after: {
        status: "PENDING",
        bypass: gate.viaAdmin ? "admin" : undefined,
        grantId: gate.grantId ?? undefined,
      },
    });
    await notifyDisplayRevoked(id);
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "リンク解除に失敗しました"));
  }
}

/** 失効。次の再読込で登録画面に戻る。**現場に行かずに取り上げられる**。 */
export async function revokeDisplay(id: string): Promise<ActionResult> {
  const gate = await useElevation("kiosk_device.revoke_display");
  if (!gate.ok) return actionError(gate.error);
  if (!uuidSchema.safeParse(id).success) return actionError("入力が不正です");

  try {
    const before = await prisma.displayDevice.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!before) return actionError("対象のディスプレイが見つかりません");

    await prisma.displayDevice.update({
      where: { id },
      data: {
        status: "REVOKED",
        deviceTokenHash: null,
        deviceTokenExpiresAt: null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "display_devices",
      recordId: id,
      before: { status: before.status },
      after: {
        status: "REVOKED",
        bypass: gate.viaAdmin ? "admin" : undefined,
        grantId: gate.grantId ?? undefined,
      },
    });
    await notifyDisplayRevoked(id);
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "失効に失敗しました"));
  }
}

/** プロファイルごと消す（オープン or 失効済みのときだけ）。 */
export async function deleteDisplay(id: string): Promise<ActionResult> {
  const gate = await useElevation("kiosk_device.revoke_display");
  if (!gate.ok) return actionError(gate.error);
  if (!uuidSchema.safeParse(id).success) return actionError("入力が不正です");

  try {
    const before = await prisma.displayDevice.findUnique({
      where: { id },
      select: { status: true, name: true },
    });
    if (!before) return actionError("対象のディスプレイが見つかりません");
    if (before.status !== "REVOKED" && before.status !== "PENDING") {
      return actionError("先にリンク解除または失効させてください");
    }
    await prisma.displayDevice.delete({ where: { id } });
    await recordAudit({
      action: "DELETE",
      tableName: "display_devices",
      recordId: id,
      before,
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "削除に失敗しました"));
  }
}
