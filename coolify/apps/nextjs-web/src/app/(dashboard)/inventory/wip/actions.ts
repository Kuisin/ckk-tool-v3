"use server";

/**
 * Server Actions — 在庫管理の「仕掛品」タブ。
 *
 * - renameWipState: 加工状態に呼び名を付ける（任意のラベル）。
 * - reclassifyWip: 「未分類」の仕掛品を、仕掛ブランク（材種 × 径 × 長）×
 *   加工状態 × 仕上がり寸法 × 目標製品 へ分類する。
 *
 * **分類は数量を書き換えない。** 未分類のバケットから OUT、分類先のバケットへ
 * IN を**同じ入出庫伝票 1 枚**に書く — 在庫の増減はすべて台帳の取引であること
 * （lib/inventory-writer-guard.test.ts）を保つため。伝票番号は他の書類と同じく
 * DB が払い出す（番号設計 PR-C — 行を作って doc_ref を読み戻す）。
 *
 * 権限はどちらも在庫の調整と同じ `inventory:UPDATE`。
 */

import { rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { Prisma, prisma } from "@/lib/db";
import { formatMovementNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import {
  applyTransaction,
  createMovement,
  ensureItemInventory,
  wipBlankItemIdTx,
  wipStateIdTx,
} from "@/lib/inventory";
import { inventoryTypeOf } from "@/lib/inventory-item-type";
import { decodeInventoryNote } from "@/lib/inventory-note-core";
import { inventoryNoteLabel } from "@/lib/inventory-note-labels";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInputOrNull,
  prismaErrorMessage,
} from "@/lib/server-action";
import { trimNumber, validateWipReclassify } from "@/lib/wip-stock-core";

const BASE_PATH = "/inventory";

// ─── 加工状態に名前を付ける ─────────────────────────────────────────────────

const renameSchema = z.object({
  wipStateId: z.number().int().positive(),
  /** 日本語の呼び名。空 = 呼び名を外す（工程名の並びで見せる）。 */
  nameJa: z.string().max(60),
  /** 日本語以外（LocalizedTextInput の多言語モーダル）。 */
  nameTranslations: z.record(z.string(), z.string().max(60)),
});

export type RenameWipStateInput = z.infer<typeof renameSchema>;

export async function renameWipState(
  input: RenameWipStateInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  const v = parsed.data;

  try {
    const state = await prisma.wipState.findUnique({
      where: { id: v.wipStateId },
      select: { id: true, name: true, isLegacy: true, signature: true },
    });
    if (!state) return actionError(tr("common.targetRecordNotFound"));
    // 「未分類」は移行が作った 1 行で、呼び名も移行が持つ（付け替えると、
    // 分類が要る行だということが画面から読めなくなる）。
    if (state.isLegacy) {
      return actionError(tr("inventory.wip.legacyStateNotRenamable"));
    }
    const name = localizedInputOrNull(v.nameJa, undefined, v.nameTranslations);
    await prisma.wipState.update({
      where: { id: state.id },
      // 空欄 = 呼び名なし（Json? の列は Prisma.DbNull で消す）。
      data: { name: name ?? Prisma.DbNull },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "wip_states",
      recordId: String(state.id),
      before: { name: state.name },
      after: { name, signature: state.signature },
    });
    revalidatePath(BASE_PATH);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("inventory.wip.renameFailed"), tr),
    );
  }
}

// ─── 分類する（未分類 → 仕掛ブランク × 加工状態） ───────────────────────────

const reclassifySchema = z.object({
  inventoryId: z.string().uuid(),
  quantity: z.number().nullable(),
  materialTypeId: z.number().int().positive().nullable(),
  diameterMm: z.number().nullable(),
  lengthMm: z.number().nullable(),
  stepIds: z.array(z.number().int().positive()).max(50),
  finishedDiameterMm: z.number().nullable(),
  finishedLengthMm: z.number().nullable(),
  aimedItemId: z.number().int().positive().nullable(),
});

export type ReclassifyWipInput = z.infer<typeof reclassifySchema>;

/** 業務上の理由で断るときの例外（message はそのまま画面に返す訳済みの文）。 */
class ReclassifyRefused extends Error {}

export async function reclassifyWip(
  input: ReclassifyWipInput,
): Promise<
  ActionResult<{ movementNumber: string; targetInventoryId: string }>
> {
  const tr = await getTranslations();
  const authz = await checkPermission("inventory", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = reclassifySchema.safeParse(input);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  const v = parsed.data;

  try {
    // custody-scope: / owner-scope: / wip-scope: id 1 件の読み出し。自社の
    // 未分類の仕掛品であることは下で確かめる（預け分・預り品は断る）。
    const head = await prisma.itemInventory.findUnique({
      where: { id: v.inventoryId },
      select: { plantId: true },
    });
    if (!head) return actionError(tr("common.targetRecordNotFound"));
    // 行スコープ: 一覧と同じ（保管拠点）。見えない行は「無い」と答える。
    if (!rowInScope(authz.access, { plantIds: [head.plantId] }, authz.userId)) {
      return actionError(tr("common.targetRecordNotFound"));
    }

    // 選んだマスタが実在すること（FK の生メッセージより先に読める文で断る）。
    const [materialType, steps, aimed] = await Promise.all([
      v.materialTypeId != null
        ? prisma.materialType.findUnique({
            where: { id: v.materialTypeId },
            select: { id: true },
          })
        : null,
      v.stepIds.length > 0
        ? prisma.processStepCatalog.findMany({
            where: { id: { in: v.stepIds } },
            select: { id: true, name: true, affectsWipState: true },
          })
        : [],
      v.aimedItemId != null
        ? prisma.item.findUnique({
            where: { id: v.aimedItemId },
            select: { id: true, itemType: true },
          })
        : null,
    ]);
    if (v.materialTypeId != null && !materialType) {
      return actionError(tr("common.targetRecordNotFound"));
    }
    // 加工状態は「形を変える工程」の並び。数えない工程（検査・出し等）を
    // 入れると、同じ品が別の状態として並び、突合が合わなくなる。
    const stepOf = new Map(steps.map((s) => [s.id, s]));
    for (const id of v.stepIds) {
      if (!stepOf.get(id)?.affectsWipState) {
        return actionError(tr("inventory.wip.reclassify.stepNotCounted"));
      }
    }
    // 目標製品は製品だけ（素材・仕掛ブランク・再研磨の品目は目標にならない）。
    if (v.aimedItemId != null && aimed?.itemType !== "PRODUCT") {
      return actionError(tr("inventory.wip.reclassify.aimedMustBeProduct"));
    }

    const stateLabel =
      v.stepIds.length === 0
        ? tr("inventory.wip.unprocessed")
        : v.stepIds
            .map((id) =>
              localized(stepOf.get(id)?.name as LocalizedText | null),
            )
            .join(" › ");

    const { targetInventoryId, movementNumber } = await prisma.$transaction(
      async (tx) => {
        // custody-scope: / owner-scope: / wip-scope: 上と同じ id の引き直し（tx の中）。
        const src = await tx.itemInventory.findUnique({
          where: { id: v.inventoryId },
          include: {
            item: { select: { id: true, code: true, itemType: true } },
            wipState: { select: { isLegacy: true } },
          },
        });
        if (!src)
          throw new ReclassifyRefused(tr("common.targetRecordNotFound"));
        // 分類できるのは自社の「未分類」の行だけ。分類済みの仕掛品を別の状態へ
        // 付け替える口にはしない（加工状態は工程の実績から決まるもの）。
        if (
          !src.wipState?.isLegacy ||
          src.custodyBpId != null ||
          src.ownerBpId != null
        ) {
          throw new ReclassifyRefused(tr("inventory.wip.reclassify.notLegacy"));
        }
        // 引当済みの分は動かせない（在庫移動と同じ — 引当が追えなくなる）。
        const available = Number(src.quantity) - Number(src.reservedQuantity);
        const checked = validateWipReclassify(
          {
            quantity: v.quantity,
            materialTypeId: v.materialTypeId,
            diameterMm: v.diameterMm,
            lengthMm: v.lengthMm,
            stepIds: v.stepIds,
            finishedDiameterMm: v.finishedDiameterMm,
            finishedLengthMm: v.finishedLengthMm,
            // 目標製品の既定: 行が持つ目標製品 → 品目が製品ならその製品。
            aimedItemId:
              v.aimedItemId ??
              src.aimedItemId ??
              (src.item.itemType === "PRODUCT" ? src.item.id : null),
          },
          available,
        );
        if (!checked.value) {
          throw new ReclassifyRefused(
            tr(
              `inventory.wip.reclassify.issue.${checked.issues[0]}` as never,
              {
                available,
              } as never,
            ),
          );
        }
        const c = checked.value;

        // 仕掛ブランクと加工状態は DB の関数が寄せる（計上・移行と同じ作り方）。
        const blankItemId = await wipBlankItemIdTx(tx, {
          materialTypeId: c.materialTypeId,
          diameterMm: c.diameterMm,
          lengthMm: c.lengthMm,
        });
        const wipStateId = await wipStateIdTx(tx, c.stepIds);
        // 場所・ロット・発生工程・単位はそのまま — 棚にある物は動いていない。
        const targetId = await ensureItemInventory(tx, {
          itemId: blankItemId,
          unit: src.unit,
          plantId: src.plantId,
          storageLocationId: src.storageLocationId,
          shelfId: src.shelfId,
          lotNumber: src.lotNumber,
          sourceStepId: src.sourceStepId,
          wipStateId,
          aimedItemId: c.aimedItemId,
          finishedDiameterMm: c.finishedDiameterMm,
          finishedLengthMm: c.finishedLengthMm,
        });

        const note = tr("inventory.wip.reclassify.movementNote", {
          size: `φ${trimNumber(c.diameterMm)} × ${trimNumber(c.lengthMm)}`,
          state: stateLabel,
        });
        const movementId = await createMovement(tx, {
          // 業務の事由としては「その他」— 棚の付け替え（在庫移動）でも棚卸の
          // 調整でもなく、同じ物の名乗りを直すだけ。中身は notes と取引の
          // referenceType = wip_reclassify が持つ。
          cause: "OTHER",
          plantId: src.plantId,
          notes: note,
        });
        const inventoryType = inventoryTypeOf(src.item.itemType);
        await applyTransaction(tx, movementId, {
          inventoryType,
          inventoryId: src.id,
          transactionType: "OUT",
          quantity: c.quantity,
          referenceType: "wip_reclassify",
          referenceId: targetId,
          notes: note,
        });
        await applyTransaction(tx, movementId, {
          inventoryType,
          inventoryId: targetId,
          transactionType: "IN",
          quantity: c.quantity,
          referenceType: "wip_reclassify",
          referenceId: src.id,
          notes: note,
        });

        await recordAudit({
          action: "UPDATE",
          tableName: "item_inventory",
          recordId: src.id,
          after: {
            note,
            item: src.item.code,
            quantity: c.quantity,
            targetInventoryId: targetId,
            wipStateId,
            aimedItemId: c.aimedItemId,
          },
        });
        const movement = await tx.inventoryMovement.findUniqueOrThrow({
          where: { id: movementId },
          select: { docRef: true },
        });
        return {
          targetInventoryId: targetId,
          movementNumber: formatMovementNumber(movement),
        };
      },
    );

    revalidatePath(BASE_PATH);
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/movements");
    return actionOk({
      movementNumber,
      targetInventoryId,
    });
  } catch (e) {
    if (e instanceof ReclassifyRefused) return actionError(e.message);
    // 同時に別の操作が在庫を減らした等 — applyTransaction の構造化ノートを訳す。
    if (e instanceof Error && decodeInventoryNote(e.message)) {
      return actionError(inventoryNoteLabel(tr, e.message) ?? e.message);
    }
    return actionError(
      prismaErrorMessage(e, tr("inventory.wip.reclassify.failed"), tr),
    );
  }
}
