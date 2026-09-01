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
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { generateCode } from "@/lib/crockford";
import { prisma } from "@/lib/db";
import { useElevation } from "@/lib/privileged-access";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/settings/kiosk-cards";

/** カード ID（Crockford 16桁・正規化形）。 */
function cardIdSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z
    .string()
    .regex(
      /^[A-Z2-9]{16}$/,
      tr("settings.kioskCardActions.invalidCardIdFormat"),
    );
}

function revalidate(cardId?: string) {
  revalidatePath(BASE_PATH);
  if (cardId) revalidatePath(`${BASE_PATH}/${cardId}`);
}

/**
 * 有効期間の入力（ISO 日時文字列 / null = 無期限）。クライアントが
 * ブラウザのタイムゾーンで 開始日 00:00:00 / 終了日 23:59:59.999 に変換して
 * 送る（サーバーの TZ に依存させない）。
 */
function validitySchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z
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
      { message: tr("settings.kioskCardActions.invalidDateFormat") },
    )
    .refine(
      ({ validFrom, validUntil }) =>
        !validFrom ||
        !validUntil ||
        validFrom.getTime() <= validUntil.getTime(),
      {
        message: tr(
          "settings.kioskCardActions.validFromMustBeBeforeValidUntil",
        ),
      },
    );
}

// ── 発行 ────────────────────────────────────────────────────────────────────

const issueInput = z.object({
  count: z.number().int().min(1).max(100),
});

/** 未割当カードを count 枚発行する（ID は Crockford 16桁）。 */
export async function issueCards(raw: {
  count: number;
}): Promise<ActionResult<{ ids: string[] }>> {
  const tr = await getTranslations();
  const gate = await useElevation("kiosk_card.issue");
  if (!gate.ok) return actionError(gate.error);
  const parsed = issueInput.safeParse(raw);
  if (!parsed.success)
    return actionError(tr("settings.kiosk.setTheNumberOfCardsBetween"));
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
    if (ids.length < count) {
      return actionError(tr("settings.kioskCardActions.issueFailed"));
    }
    await recordAudit({
      action: "CREATE",
      tableName: "kiosk_cards",
      recordId: ids.join(","),
      after: {
        note: tr("settings.kioskCardActions.auditCardsIssued", {
          count: ids.length,
        }),
      },
    });
    revalidate();
    return actionOk({ ids });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.kioskCardActions.issueFailed"), tr),
    );
  }
}

// ── 割当 ────────────────────────────────────────────────────────────────────

function assignInput(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    cardId: cardIdSchema(tr),
    userId: z
      .string()
      .uuid(tr("settings.kioskCardActions.invalidUserSpecified")),
    // 任意: テンポラリカードとして割当時に有効期間を設定
    validity: validitySchema(tr).optional(),
  });
}

/** 未割当カードをユーザーに割り当てる（1 ユーザー 1 枚）。 */
export async function assignCard(raw: {
  cardId: string;
  userId: string;
  validity?: { validFrom: string | null; validUntil: string | null };
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await useElevation("kiosk_card.assign");
  if (!gate.ok) return actionError(gate.error);
  const parsed = assignInput(tr).safeParse(raw);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  const { cardId, userId, validity } = parsed.data;

  try {
    const card = await prisma.kioskCard.findUnique({ where: { id: cardId } });
    if (!card) return actionError(tr("settings.kioskCardActions.cardNotFound"));
    if (card.status === "ASSIGNED") {
      return actionError(tr("settings.kioskCardActions.cardAlreadyAssigned"));
    }
    if (card.status !== "UNASSIGNED") {
      return actionError(
        tr("settings.kioskCardActions.onlyUnassignedCardsCanBeAssigned"),
      );
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return actionError(
        tr("settings.kioskCardActions.targetUserNotFoundOrInactive"),
      );
    }
    const existing = await prisma.kioskCard.findFirst({
      where: { userId, status: "ASSIGNED" },
      select: { id: true },
    });
    if (existing) {
      return actionError(
        tr("settings.kioskCardActions.userAlreadyHasAssignedCardLong"),
      );
    }
    await prisma.kioskCard.update({
      where: { id: cardId },
      data: {
        status: "ASSIGNED",
        userId,
        assignedAt: new Date(),
        assignedById: gate.userId,
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
    const message = prismaErrorMessage(
      e,
      tr("settings.kioskCardActions.assignFailed"),
      tr,
    );
    return actionError(
      message === tr("common.duplicateCodeExists")
        ? tr("settings.kioskCardActions.userAlreadyHasAssignedCardShort")
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
  const tr = await getTranslations();
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = cardIdSchema(tr).safeParse(cardId);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: parsed.data },
    });
    if (!card) return actionError(tr("settings.kioskCardActions.cardNotFound"));
    if (card.status !== from) {
      return actionError(
        tr("settings.kioskCardActions.cardNotInStateForTransition", { note }),
      );
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskCardActions.transitionFailed", { note }),
        tr,
      ),
    );
  }
}

/** 割当済カードを一時停止する（ログイン不可）。 */
export async function suspendCard(cardId: string): Promise<ActionResult> {
  const tr = await getTranslations();
  return transitionCard(
    cardId,
    "ASSIGNED",
    "SUSPENDED",
    tr("settings.kioskCardDetailView.suspend"),
  );
}

/** 一時停止中のカードを再開する。 */
export async function resumeCard(cardId: string): Promise<ActionResult> {
  const tr = await getTranslations();
  return transitionCard(cardId, "SUSPENDED", "ASSIGNED", tr("common.resume"));
}

/** カードを取り消す（復元不可）。オープン中のキオスクセッションも失効させる。 */
export async function revokeCard(cardId: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await useElevation("kiosk_card.revoke");
  if (!gate.ok) return actionError(gate.error);
  const parsed = cardIdSchema(tr).safeParse(cardId);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: parsed.data },
    });
    if (!card) return actionError(tr("settings.kioskCardActions.cardNotFound"));
    if (card.status === "REVOKED") {
      return actionError(tr("settings.kioskCardActions.cardAlreadyRevoked"));
    }
    const now = new Date();
    await prisma.$transaction([
      prisma.kioskCard.update({
        where: { id: parsed.data },
        data: {
          status: "REVOKED",
          revokedAt: now,
          revokedById: gate.userId,
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
    return actionError(
      prismaErrorMessage(e, tr("settings.kioskCardActions.revokeFailed"), tr),
    );
  }
}

// ── 有効期間（テンポラリカード） ─────────────────────────────────────────────

function updateValidityInput(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    cardId: cardIdSchema(tr),
    validity: validitySchema(tr),
  });
}

/**
 * カードの有効期間を設定・変更・解除する（両方 null = 無期限に戻す）。
 * 期間外のカードはキオスクでログイン不可（判定はキオスク側のログイン時のみ —
 * 既存セッションは 8h ハード期限 / 5分アイドルで自然失効）。
 */
export async function updateCardValidity(raw: {
  cardId: string;
  validity: { validFrom: string | null; validUntil: string | null };
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await useElevation("kiosk_card.update_validity");
  if (!gate.ok) return actionError(gate.error);
  const parsed = updateValidityInput(tr).safeParse(raw);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  const { cardId, validity } = parsed.data;

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: cardId },
      select: { status: true, validFrom: true, validUntil: true },
    });
    if (!card) return actionError(tr("settings.kioskCardActions.cardNotFound"));
    if (card.status === "REVOKED") {
      return actionError(
        tr("settings.kioskCardActions.revokedCardCannotBeChanged"),
      );
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskCardActions.validityUpdateFailed"),
        tr,
      ),
    );
  }
}

// ── 同時ログイン上限 ─────────────────────────────────────────────────────────

function updateSessionLimitInput(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    cardId: cardIdSchema(tr),
    maxActiveSessions: z
      .number()
      .int()
      .min(1, tr("settings.kiosk.setTheConcurrentLoginLimitBetween"))
      .max(10, tr("settings.kiosk.setTheConcurrentLoginLimitBetween")),
  });
}

/**
 * カードの同時ログイン上限を変更する（既定 1 台）。超過分はキオスクの
 * ログイン時に最終活動が最も古いセッションから失効される（= 最も古い端末を
 * ログアウト）。上限を下げても既存セッションは即時失効しない — 次のログイン
 * 時に enforce される。
 */
export async function updateCardSessionLimit(raw: {
  cardId: string;
  maxActiveSessions: number;
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await useElevation("kiosk_card.update_session_limit");
  if (!gate.ok) return actionError(gate.error);
  const parsed = updateSessionLimitInput(tr).safeParse(raw);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  const { cardId, maxActiveSessions } = parsed.data;

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: cardId },
      select: { status: true, maxActiveSessions: true },
    });
    if (!card) return actionError(tr("settings.kioskCardActions.cardNotFound"));
    if (card.status === "REVOKED") {
      return actionError(
        tr("settings.kioskCardActions.revokedCardCannotBeChanged"),
      );
    }
    await prisma.kioskCard.update({
      where: { id: cardId },
      data: { maxActiveSessions },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_cards",
      recordId: cardId,
      before: { maxActiveSessions: card.maxActiveSessions },
      after: { maxActiveSessions },
    });
    revalidate(cardId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskCardActions.sessionLimitUpdateFailed"),
        tr,
      ),
    );
  }
}

// ── PIN 管理 ────────────────────────────────────────────────────────────────

/** PIN をリセットする（次回ログインで再設定必須）。 */
export async function resetPin(cardId: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await useElevation("kiosk_card.reset_pin");
  if (!gate.ok) return actionError(gate.error);
  const parsed = cardIdSchema(tr).safeParse(cardId);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: parsed.data },
      select: { status: true },
    });
    if (!card) return actionError(tr("settings.kioskCardActions.cardNotFound"));
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
      after: { note: tr("settings.kioskCardActions.auditPinReset") },
    });
    revalidate(parsed.data);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.kioskCardActions.pinResetFailed"), tr),
    );
  }
}

/** PIN 連続失敗ロックを解除する（PIN 自体は保持）。 */
export async function unlockPin(cardId: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const gate = await useElevation("kiosk_card.unlock_pin");
  if (!gate.ok) return actionError(gate.error);
  const parsed = cardIdSchema(tr).safeParse(cardId);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  try {
    const card = await prisma.kioskCard.findUnique({
      where: { id: parsed.data },
      select: { status: true },
    });
    if (!card) return actionError(tr("settings.kioskCardActions.cardNotFound"));
    await prisma.kioskCard.update({
      where: { id: parsed.data },
      data: { pinFailedAttempts: 0, pinLockedUntil: null },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "kiosk_cards",
      recordId: parsed.data,
      after: { note: tr("settings.kioskCardActions.auditPinUnlocked") },
    });
    revalidate(parsed.data);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("settings.kioskCardActions.pinUnlockFailed"),
        tr,
      ),
    );
  }
}
