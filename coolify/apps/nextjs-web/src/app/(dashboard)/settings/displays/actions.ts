"use server";

/**
 * Server Actions — ディスプレイ管理（SY0I, /settings/displays）。
 *
 * 権限の分け方（SY09 端末管理と同じ考え方）:
 *   一覧・詳細・名称や設置場所の変更・表示内容の切替 … 素の `kiosk`
 *   登録（ペアリング）・失効                       … 特権操作 `kiosk_device`
 *
 * 前者を承認制にしないのは、承認を挟むほど「掲示を差し替える」が重くなり、
 * 結局その機能が使われなくなるため。後者を承認制にするのは、画面を 1 枚
 * 増やす／取り上げることが、業務データの出る場所そのものを変える操作だから。
 *
 * 変更は必ず対象の画面へ合図を送る（lib/display-events.ts）。合図が落ちても
 * ディスプレイは自分の再取得間隔で追いつくので、送信の失敗で操作は倒さない。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { DISPLAY_CONTENT_SCHEMAS } from "@/lib/display-content";
import {
  notifyDisplayConfigChanged,
  notifyDisplayRevoked,
  notifyProfileChanged,
} from "@/lib/display-events";
import { lookupPairingSession } from "@/lib/displays-admin";
import { mintMonitorToken } from "@/lib/kiosk-ws-token";
import { useElevation } from "@/lib/privileged-access";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/settings/displays";

function revalidate() {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/profiles`);
}

const uuidSchema = z.string().uuid();

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

// ── ペアリング（特権操作） ───────────────────────────────────────────────────

const pairSchema = z.object({
  code: z.string().min(1),
  nameJa: z.string().trim().min(1, "名前を入力してください"),
  nameEn: z.string().trim().optional(),
  location: z.string().trim().optional(),
  plantId: z.number().int().positive().nullable().optional(),
  profileId: z.string().uuid().nullable().optional(),
});

/**
 * ディスプレイを登録する。**行はここで初めて生まれる**（code-first）。
 * トークンはここでは作らない — ディスプレイ側のポーリングが自分で受け取る。
 */
export async function pairDisplay(raw: {
  code: string;
  nameJa: string;
  nameEn?: string;
  location?: string;
  plantId?: number | null;
  profileId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await useElevation("kiosk_device.pair_display");
  if (!gate.ok) return actionError(gate.error);
  const parsed = pairSchema.safeParse(raw);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const { code, nameJa, nameEn, location, plantId, profileId } = parsed.data;

  const session = await lookupPairingSession(code);
  if (!session.ok) {
    if (session.reason === "EXPIRED") {
      return actionError(
        "登録コードの有効期限が切れています。画面に出ている新しいコードを読み取ってください",
      );
    }
    if (session.reason === "ALREADY_PAIRED") {
      return actionError("この登録コードは既に使われています");
    }
    return actionError("登録コードが見つかりません");
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const device = await tx.displayDevice.create({
        data: {
          name: localizedInput(nameJa, nameEn),
          location: location || null,
          plantId: plantId ?? null,
          displayProfileId: profileId ?? null,
          status: "ACTIVE",
          pairedById: gate.userId,
          pairedAt: new Date(),
        },
        select: { id: true },
      });
      // 成立の印。ディスプレイのポーリングはこれを見てトークンを受け取る。
      await tx.displayPairingSession.update({
        where: { id: session.sessionId },
        data: { displayDeviceId: device.id },
      });
      return device;
    });

    await recordAudit({
      action: "CREATE",
      tableName: "display_devices",
      recordId: created.id,
      after: {
        name: nameJa,
        location: location || null,
        plantId: plantId ?? null,
        profileId: profileId ?? null,
        bypass: gate.viaAdmin ? "admin" : undefined,
        grantId: gate.grantId ?? undefined,
      },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "登録に失敗しました"));
  }
}

// ── 変更（素の kiosk 権限） ──────────────────────────────────────────────────

const updateSchema = z.object({
  id: z.string().uuid(),
  nameJa: z.string().trim().min(1, "名前を入力してください"),
  nameEn: z.string().trim().optional(),
  location: z.string().trim().optional(),
  plantId: z.number().int().positive().nullable().optional(),
  profileId: z.string().uuid().nullable().optional(),
});

export async function updateDisplay(raw: {
  id: string;
  nameJa: string;
  nameEn?: string;
  location?: string;
  plantId?: number | null;
  profileId?: string | null;
}): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const { id, nameJa, nameEn, location, plantId, profileId } = parsed.data;

  try {
    const before = await prisma.displayDevice.findUnique({
      where: { id },
      select: {
        name: true,
        location: true,
        plantId: true,
        displayProfileId: true,
      },
    });
    if (!before) return actionError("対象のディスプレイが見つかりません");

    await prisma.displayDevice.update({
      where: { id },
      data: {
        name: localizedInput(nameJa, nameEn),
        location: location || null,
        plantId: plantId ?? null,
        displayProfileId: profileId ?? null,
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
        displayProfileId: profileId ?? null,
      },
    });
    // 表示内容が変わったなら、その場で画面を切り替える
    if (before.displayProfileId !== (profileId ?? null)) {
      await notifyDisplayConfigChanged(id);
    }
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
      return actionError("失効したディスプレイは再開できません");
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

// ── 失効（特権操作） ─────────────────────────────────────────────────────────

/**
 * 失効。トークンを破棄するので、その画面は次の再読込で登録画面に戻る。
 * **現場に行かずに取り上げられる**のがこの操作の意味。
 */
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

/** 失効済みの行を消す（台帳から片付ける）。 */
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
    if (before.status !== "REVOKED") {
      return actionError("先に失効させてください");
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

// ── 表示内容（プロファイル） ────────────────────────────────────────────────

const CONTENT_TYPES = ["APP_PAGE", "METABASE", "URL", "IMAGE"] as const;

const profileSchema = z.object({
  id: z.string().uuid().optional(),
  nameJa: z.string().trim().min(1, "名前を入力してください"),
  nameEn: z.string().trim().optional(),
  description: z.string().trim().optional(),
  contentType: z.enum(CONTENT_TYPES),
  /** 種別ごとに形が違うので、ここでは受け取るだけ。検証は下の 1 か所で行う。 */
  contentConfig: z.unknown(),
  refreshIntervalSec: z.number().int().min(0).max(86_400),
  isEnabled: z.boolean(),
});

export type ProfileInput = z.input<typeof profileSchema>;

/** 種別に応じた content_config の検証。**保存と配信の両方でここを通す。** */
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

export async function saveDisplayProfile(
  raw: ProfileInput,
): Promise<ActionResult<{ id: string }>> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const config = validateConfig(v.contentType, v.contentConfig);
  if (!config.ok) return actionError(config.error);

  try {
    const data = {
      name: localizedInput(v.nameJa, v.nameEn),
      description: v.description || null,
      contentType: v.contentType,
      contentConfig: config.value as object,
      refreshIntervalSec: v.refreshIntervalSec,
      isEnabled: v.isEnabled,
    };

    if (v.id) {
      const before = await prisma.displayProfile.findUnique({
        where: { id: v.id },
        select: {
          name: true,
          contentType: true,
          contentConfig: true,
          refreshIntervalSec: true,
          isEnabled: true,
        },
      });
      if (!before) return actionError("対象の表示内容が見つかりません");
      await prisma.displayProfile.update({ where: { id: v.id }, data });
      await recordAudit({
        action: "UPDATE",
        tableName: "display_profiles",
        recordId: v.id,
        before,
        after: { ...data, name: v.nameJa },
      });
      // これを使っている画面すべてを切り替える
      await notifyProfileChanged(v.id);
      revalidate();
      return actionOk({ id: v.id });
    }

    const created = await prisma.displayProfile.create({
      data,
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "display_profiles",
      recordId: created.id,
      after: { ...data, name: v.nameJa },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "保存に失敗しました"));
  }
}

/** 使っている画面が無いときだけ消せる（黒画面を作らない）。 */
export async function deleteDisplayProfile(id: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!uuidSchema.safeParse(id).success) return actionError("入力が不正です");

  try {
    const inUse = await prisma.displayDevice.count({
      where: { displayProfileId: id },
    });
    if (inUse > 0) {
      return actionError(
        `${inUse} 台のディスプレイが使用中です。先に割り当てを変更してください`,
      );
    }
    const before = await prisma.displayProfile.findUnique({
      where: { id },
      select: { name: true, contentType: true },
    });
    if (!before) return actionError("対象の表示内容が見つかりません");

    await prisma.displayProfile.delete({ where: { id } });
    await recordAudit({
      action: "DELETE",
      tableName: "display_profiles",
      recordId: id,
      before,
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "削除に失敗しました"));
  }
}
