"use server";

/**
 * Server Actions — 移動タイプ (ST09).
 *
 * 手動入出庫 (ST06) が選ぶ番号つきの型。番号 + { ja, en } 名称 + 向き +
 * 出庫元/入庫先の要否 + 表示順のみの小さなマスタ。詳細ページを持たず、
 * 一覧のモーダルで作成・編集する。
 *
 * **削除は提供しない。** 伝票（inventory_movements.movement_type_id, FK
 * Restrict）が参照している型は消せない上、消えると過去の伝票から型が読めなく
 * なる。使わなくなった型は無効化（isActive=false）に倒す — マスタ全般と同じ
 * 規約（不良種類のような delete は例外的な扱い）。
 *
 * 向きが決める最低要求（lib/movement-type-core.ts requiredEndpoints）は
 * **その場で強制せず、保存時に検査して断る** — 利用者が requiresFrom /
 * requiresTo を自由に触れる代わりに、向きと矛盾する組み合わせは isValidRule
 * で弾いて理由を返す（黙って直さない）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  isValidRule,
  type MovementDirection,
  requiredEndpoints,
} from "@/lib/movement-type-core";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/inventory/movement-types";

const DIRECTIONS = ["IN", "OUT", "TRANSFER"] as const;

function movementTypeInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return z.object({
    code: z.string().min(1, tr("common.codeRequired")),
    nameJa: z.string().min(1, tr("common.nameJaRequired")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    direction: z.enum(DIRECTIONS),
    requiresFrom: z.boolean(),
    requiresTo: z.boolean(),
    sortOrder: z
      .number()
      .int(tr("master.processSteps.sortOrderInteger"))
      .min(0),
    isActive: z.boolean(),
    notes: z.string().optional(),
  });
}

export type MovementTypeInput = z.infer<
  ReturnType<typeof movementTypeInputSchema>
>;

function revalidate() {
  revalidatePath(BASE_PATH);
  // 手動入出庫 (ST06) の Select はこの一覧から選択肢を作るので、有効/無効・
  // 名称の変更も併せて反映する。
  revalidatePath("/inventory/goods-movement");
}

/**
 * 向きが要求する下限を割っていないか（lib/movement-type-core.ts isValidRule）。
 * 割っていれば、どちら側が足りないかを添えたエラーメッセージを返す。
 */
async function ruleFloorError(
  tr: Awaited<ReturnType<typeof getTranslations>>,
  rule: {
    direction: MovementDirection;
    requiresFrom: boolean;
    requiresTo: boolean;
  },
): Promise<string | null> {
  if (isValidRule(rule)) return null;
  const min = requiredEndpoints(rule.direction);
  if (min.from && !rule.requiresFrom) {
    return tr("inventory.movementTypes.requiresFromFloor");
  }
  if (min.to && !rule.requiresTo) {
    return tr("inventory.movementTypes.requiresToFloor");
  }
  return tr("common.invalidInput");
}

export async function createMovementType(
  input: MovementTypeInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = movementTypeInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const floorError = await ruleFloorError(tr, v);
  if (floorError) return actionError(floorError);
  try {
    const created = await prisma.movementType.create({
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        direction: v.direction,
        requiresFrom: v.requiresFrom,
        requiresTo: v.requiresTo,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "movement_types",
      recordId: String(created.id),
      after: {
        code: v.code.trim(),
        nameJa: v.nameJa,
        direction: v.direction,
        requiresFrom: v.requiresFrom,
        requiresTo: v.requiresTo,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("inventory.movementTypes.createFailed"), tr),
    );
  }
}

export async function updateMovementType(
  id: number,
  input: MovementTypeInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = movementTypeInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const floorError = await ruleFloorError(tr, v);
  if (floorError) return actionError(floorError);
  try {
    const prior = await prisma.movementType.findUnique({
      where: { id },
      select: {
        direction: true,
        requiresFrom: true,
        requiresTo: true,
        sortOrder: true,
        isActive: true,
      },
    });
    // code は識別子のため更新対象に含めない（編集モーダルでも disabled）。
    await prisma.movementType.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        direction: v.direction,
        requiresFrom: v.requiresFrom,
        requiresTo: v.requiresTo,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "movement_types",
      recordId: String(id),
      before: prior ?? undefined,
      after: {
        nameJa: v.nameJa,
        direction: v.direction,
        requiresFrom: v.requiresFrom,
        requiresTo: v.requiresTo,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      },
    });
    revalidate();
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("inventory.movementTypes.updateFailed"), tr),
    );
  }
}

export async function setMovementTypesActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    await prisma.movementType.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "movement_types",
        recordId: String(id),
        after: { isActive },
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("common.statusUpdateFailed"), tr),
    );
  }
}
