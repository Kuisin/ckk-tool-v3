"use server";

/**
 * Server Actions — QRカード管理（SY08, /settings/kiosk-cards）。
 *
 * キオスクログイン用 QR カード（app.kiosk_cards）の発行・割当・停止・
 * 取り消し・PIN 管理。全アクションを RBAC（kiosk）でゲートし、監査ログ
 * （audit_logs, table=kiosk_cards, recordId=カードID）を記録する。
 *
 * 「ASSIGNED は 1 ユーザー 1 枚」は DB の partial unique index が最終防衛線 —
 * ここでは事前チェックで親切なエラーを返し、レースは P2002 で受ける。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { generateCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/settings/kiosk-cards";

/** カード ID（Crockford 16桁・正規化形）。 */
const cardIdSchema = z
  .string()
  .regex(/^[A-Z2-9]{16}$/, "カードIDの形式が正しくありません");

function revalidate(cardId?: string) {
  revalidatePath(BASE_PATH);
  if (cardId) revalidatePath(`${BASE_PATH}/${cardId}`);
}

/**
 * 有効期間の入力（ISO 日時文字列 / null = 無期限）。クライアントが
 * ブラウザのタイムゾーンで 開始日 00:00:00 / 終了日 23:59:59.999 に変換して
 * 送る（サーバーの TZ に依存させない）。
 */
const validitySchema = z
  .object({
    validFrom: z.string().nullable(),
    validUntil: z.string().nullable(),
  })
  .transform(({ validFrom, validUntil }) => ({
    validFrom: validFrom ? new Date(validFrom) : null,
    validUntil: validUntil ? new Date(validUntil) : null,
  }))
  .refine(
    ({ validFrom, validUntil }) =>
      (!validFrom || !Number.isNaN(validFrom.getTime())) &&
      (!validUntil || !Number.isNaN(validUntil.getTime())),
    { message: "日付の形式が正しくありません" },
  )
  .refine(
    ({ validFrom, validUntil }) =>
      !validFrom || !validUntil || validFrom.getTime() <= validUntil.getTime(),
    { message: "有効期間の開始日は終了日以前にしてください" },
  );

// ── 発行 ────────────────────────────────────────────────────────────────────

const issueInput = z.object({
  count: z.number().int().min(1).max(100),
});

/** 未割当カードを count 枚発行する（ID は Crockford 16桁）。 */
export async function issueCards(raw: {
  count: number;
}): Promise<ActionResult<{ ids: string[] }>> {
  const authz = await checkPermission("kiosk", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = issueInput.safeParse(raw);
  if (!parsed.success)
    return actionError("発行枚数は 1〜100 で指定してください");
  const { count } = parsed.data;

  try {
    const ids: string[] = [];
    // 衝突（確率的にほぼゼロ）は skipDuplicates で無視し、足りない分を再生成。
    for (let attempt = 0; attempt < 3 && ids.length < count; attempt++) {
      const batch = Array.from({ length: count - ids.length }, () =>
        generateCode(16),
      );
      const res = await prisma.kioskCard.createMany({
        data: batch.map((id) => ({ id })),
        skipDuplicates: true,
      });
      if (res.count === batch.length) {
        ids.push(...batch);
      } else {
        // どれが重複したか確認して成功分のみ採用。
        const created = await prisma.kioskCard.findMany({
          where: { id: { in: batch } },
          select: { id: true },
        });
        ids.push(...created.map((c) => c.id));
      }
    }
    if (ids.length < count) return actionError("カードの発行に失敗しました");
    await recordAudit({
      action: "CREATE",
      tableName: "kiosk_cards",
      recordId: ids.join(","),
      after: { note: `QRカードを ${ids.length} 枚発行` },
    });
    revalidate();
    return actionOk({ ids });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "カードの発行に失敗しました"));
  }
}

// ── 割当 ────────────────────────────────────────────────────────────────────

const assignInput = z.object({
  cardId: cardIdSchema,
  userId: z.string().uuid("ユーザーの指定が不正です"),
  // 任意: テンポラリカードとして割当時に有効期間を設定
  validity: validitySchema.optional(),
});

/** 未割当カードをユーザーに割り当てる（1 ユーザー 1 枚）。 */
export async function assignCard(raw: {
  cardId: string;
  userId: string;
  validity?: { validFrom: string | null; validUntil: string | null };
}): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = assignInput.safeParse(raw);
  if (!parsed.success)
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  const { cardId, userId, validity } = parsed.data;

  try {
    const card = await prisma.kioskCard.findUnique({ where: { id: cardId } });
    if (!card) return actionError("対象のカードが見つかりません");
    if (card.status === "ASSIGNED") {
      return actionError(
        "このカードは割当済です。別のユーザーに割り当てるには先に取り消してください",
      );
    }
    if (card.status !== "UNASSIGNED") {
      return actionError("未割当のカードのみ割り当てできます");
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return actionError("対象のユーザーが見つかりません（無効ユーザー不可）");
    }
    const existing = await prisma.kioskCard.findFirst({
      where: { userId, status: "ASSIGNED" },
      select: { id: true },
    });
    if (existing) {
      return actionError(
        "このユーザーには既に割当済のカードがあります。先に既存カードを取り消してください",
      );
    }
    await prisma.kioskCard.update({
      where: { id: cardId },
      data: {
        status: "ASSIGNED",
        userId,
        assignedAt: new Date(),
        assignedById: authz.userId,
        validFrom: validity?.validFrom ?? null,
        validUntil: validity?.validUntil ?? null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_cards",
      recordId: cardId,
      before: { status: card.status },
      after: {
        status: "ASSIGNED",
        user: user.displayName,
        validFrom: validity?.validFrom?.toISOString() ?? null,
        validUntil: validity?.validUntil?.toISOString() ?? null,
      },
    });
    revalidate(cardId);
    return actionOk();
  } catch (e) {
    // partial unique index (user_id WHERE status='ASSIGNED') のレース。
    const message = prismaErrorMessage(e, "カードの割当に失敗しました");
    return actionError(
      message === "同じコードのレコードが既に存在します"
        ? "このユーザーには既に割当済のカードがあります"
        : message,
    );
  }
}

// ── 状態遷移（停止・再開・取り消し） ─────────────────────────────────────────

async function transitionCard(
  cardId: string,
  from: "ASSIGNED" | "SUSPENDED",
  to: "ASSIGNED" | "SUSPENDED",
  note: string,
): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = cardIdSchema.safeParse(cardId);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: parsed.data },
    });
    if (!card) return actionError("対象のカードが見つかりません");
    if (card.status !== from) {
      return actionError(`このカードは${note}できる状態ではありません`);
    }
    await prisma.kioskCard.update({
      where: { id: parsed.data },
      data: { status: to },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_cards",
      recordId: parsed.data,
      before: { status: card.status },
      after: { status: to },
    });
    revalidate(parsed.data);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, `カードの${note}に失敗しました`));
  }
}

/** 割当済カードを一時停止する（ログイン不可）。 */
export async function suspendCard(cardId: string): Promise<ActionResult> {
  return transitionCard(cardId, "ASSIGNED", "SUSPENDED", "一時停止");
}

/** 一時停止中のカードを再開する。 */
export async function resumeCard(cardId: string): Promise<ActionResult> {
  return transitionCard(cardId, "SUSPENDED", "ASSIGNED", "再開");
}

/** カードを取り消す（復元不可）。オープン中のキオスクセッションも失効させる。 */
export async function revokeCard(cardId: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = cardIdSchema.safeParse(cardId);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: parsed.data },
    });
    if (!card) return actionError("対象のカードが見つかりません");
    if (card.status === "REVOKED") {
      return actionError("このカードは既に取り消し済みです");
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.kioskCard.update({
        where: { id: parsed.data },
        data: {
          status: "REVOKED",
          revokedAt: now,
          revokedById: authz.userId,
        },
      }),
      prisma.kioskSession.updateMany({
        where: { cardId: parsed.data, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_cards",
      recordId: parsed.data,
      before: { status: card.status },
      after: { status: "REVOKED" },
    });
    revalidate(parsed.data);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "カードの取り消しに失敗しました"));
  }
}

// ── 有効期間（テンポラリカード） ─────────────────────────────────────────────

const updateValidityInput = z.object({
  cardId: cardIdSchema,
  validity: validitySchema,
});

/**
 * カードの有効期間を設定・変更・解除する（両方 null = 無期限に戻す）。
 * 期間外のカードはキオスクでログイン不可（判定はキオスク側のログイン時のみ —
 * 既存セッションは 8h ハード期限 / 5分アイドルで自然失効）。
 */
export async function updateCardValidity(raw: {
  cardId: string;
  validity: { validFrom: string | null; validUntil: string | null };
}): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = updateValidityInput.safeParse(raw);
  if (!parsed.success)
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  const { cardId, validity } = parsed.data;

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: cardId },
      select: { status: true, validFrom: true, validUntil: true },
    });
    if (!card) return actionError("対象のカードが見つかりません");
    if (card.status === "REVOKED") {
      return actionError("取り消し済みのカードは変更できません");
    }
    await prisma.kioskCard.update({
      where: { id: cardId },
      data: {
        validFrom: validity.validFrom,
        validUntil: validity.validUntil,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_cards",
      recordId: cardId,
      before: {
        validFrom: card.validFrom?.toISOString() ?? null,
        validUntil: card.validUntil?.toISOString() ?? null,
      },
      after: {
        validFrom: validity.validFrom?.toISOString() ?? null,
        validUntil: validity.validUntil?.toISOString() ?? null,
      },
    });
    revalidate(cardId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "有効期間の更新に失敗しました"));
  }
}

// ── PIN 管理 ────────────────────────────────────────────────────────────────

/** PIN をリセットする（次回ログインで再設定必須）。 */
export async function resetPin(cardId: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = cardIdSchema.safeParse(cardId);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: parsed.data },
      select: { status: true },
    });
    if (!card) return actionError("対象のカードが見つかりません");
    await prisma.kioskCard.update({
      where: { id: parsed.data },
      data: {
        pinHash: null,
        pinSetAt: null,
        pinLastVerifiedAt: null,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_cards",
      recordId: parsed.data,
      after: { note: "PIN をリセット" },
    });
    revalidate(parsed.data);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "PIN のリセットに失敗しました"));
  }
}

/** PIN 連続失敗ロックを解除する（PIN 自体は保持）。 */
export async function unlockPin(cardId: string): Promise<ActionResult> {
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = cardIdSchema.safeParse(cardId);
  if (!parsed.success) return actionError("入力が不正です");

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: parsed.data },
      select: { status: true },
    });
    if (!card) return actionError("対象のカードが見つかりません");
    await prisma.kioskCard.update({
      where: { id: parsed.data },
      data: { pinFailedAttempts: 0, pinLockedUntil: null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_cards",
      recordId: parsed.data,
      after: { note: "PIN ロックを解除" },
    });
    revalidate(parsed.data);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "PIN ロックの解除に失敗しました"));
  }
}
