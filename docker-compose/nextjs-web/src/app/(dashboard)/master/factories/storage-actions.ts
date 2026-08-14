"use server";

/**
 * Server Actions — 保管場所マスタ（MS0B 工場詳細「保管場所」タブ）。
 *
 * 保管場所（storage_locations = 工場内の倉庫・置場）と棚（storage_shelves）を
 * 工場詳細からモーダルで CRUD する。在庫（product/material_inventory）が参照
 * する場所・棚は削除できない（FK RESTRICT → prismaErrorMessage）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { Prisma, prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  localizedInputOrNull,
  prismaErrorMessage,
} from "@/lib/server-action";

const codePattern = /^[A-Za-z0-9_-]+$/;

const locationInput = z.object({
  code: z
    .string()
    .min(1, "コードを入力してください")
    .regex(codePattern, "コードは英数字・ハイフン・アンダースコアで入力"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

const shelfInput = z.object({
  code: z
    .string()
    .min(1, "棚コードを入力してください")
    .regex(codePattern, "コードは英数字・ハイフン・アンダースコアで入力"),
  nameJa: z.string().optional(),
  nameEn: z.string().optional(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export type StorageLocationInput = z.infer<typeof locationInput>;
export type StorageShelfInput = z.infer<typeof shelfInput>;

function revalidate(factoryId: number) {
  revalidatePath(`/master/factories/${factoryId}`);
  revalidatePath("/production/inventory");
}

// ── 保管場所 ─────────────────────────────────────────────────────────────────

export async function createStorageLocation(
  factoryId: number,
  input: StorageLocationInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = locationInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const factory = await prisma.factory.findUnique({
      where: { id: factoryId },
      select: { id: true },
    });
    if (!factory) return actionError("対象の工場が見つかりません");
    const created = await prisma.storageLocation.create({
      data: {
        factoryId,
        code: v.code.trim(),
        name: localizedInput(v.nameJa, v.nameEn),
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "storage_locations",
      recordId: String(created.id),
      after: { factoryId, code: v.code.trim(), nameJa: v.nameJa },
    });
    revalidate(factoryId);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "保管場所の作成に失敗しました"));
  }
}

export async function updateStorageLocation(
  id: number,
  input: StorageLocationInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = locationInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const before = await prisma.storageLocation.findUnique({ where: { id } });
    if (!before) return actionError("対象の保管場所が見つかりません");
    await prisma.storageLocation.update({
      where: { id },
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, v.nameEn),
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "storage_locations",
      recordId: String(id),
      before: { code: before.code, isActive: before.isActive },
      after: { code: v.code.trim(), nameJa: v.nameJa, isActive: v.isActive },
    });
    revalidate(before.factoryId);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "保管場所の更新に失敗しました"));
  }
}

/** 保管場所の削除 — 在庫・棚から参照されていない場合のみ（棚は同時削除）。 */
export async function deleteStorageLocation(id: number): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const before = await prisma.storageLocation.findUnique({
      where: { id },
      include: { shelves: { select: { id: true } } },
    });
    if (!before) return actionError("対象の保管場所が見つかりません");
    const [prodRefs, matRefs] = await Promise.all([
      prisma.productInventory.count({ where: { storageLocationId: id } }),
      prisma.materialInventory.count({ where: { storageLocationId: id } }),
    ]);
    if (prodRefs + matRefs > 0) {
      return actionError(
        "この保管場所を参照する在庫があるため削除できません（在庫移動で空にするか、無効化してください）",
      );
    }
    await prisma.$transaction([
      prisma.storageShelf.deleteMany({ where: { locationId: id } }),
      prisma.storageLocation.delete({ where: { id } }),
    ]);
    await recordAudit({
      action: "DELETE",
      tableName: "storage_locations",
      recordId: String(id),
      before: { code: before.code, shelves: before.shelves.length },
    });
    revalidate(before.factoryId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "保管場所の削除に失敗しました"));
  }
}

// ── 棚 ───────────────────────────────────────────────────────────────────────

export async function createStorageShelf(
  locationId: number,
  input: StorageShelfInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = shelfInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const location = await prisma.storageLocation.findUnique({
      where: { id: locationId },
      select: { factoryId: true },
    });
    if (!location) return actionError("対象の保管場所が見つかりません");
    const created = await prisma.storageShelf.create({
      data: {
        locationId,
        code: v.code.trim(),
        name: localizedInputOrNull(v.nameJa, v.nameEn) ?? Prisma.DbNull,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "storage_shelves",
      recordId: String(created.id),
      after: { locationId, code: v.code.trim() },
    });
    revalidate(location.factoryId);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "棚の作成に失敗しました"));
  }
}

export async function updateStorageShelf(
  id: number,
  input: StorageShelfInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = shelfInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const before = await prisma.storageShelf.findUnique({
      where: { id },
      include: { location: { select: { factoryId: true } } },
    });
    if (!before) return actionError("対象の棚が見つかりません");
    await prisma.storageShelf.update({
      where: { id },
      data: {
        code: v.code.trim(),
        name: localizedInputOrNull(v.nameJa, v.nameEn) ?? Prisma.DbNull,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "storage_shelves",
      recordId: String(id),
      before: { code: before.code, isActive: before.isActive },
      after: { code: v.code.trim(), isActive: v.isActive },
    });
    revalidate(before.location.factoryId);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "棚の更新に失敗しました"));
  }
}

/** 棚の削除 — 在庫から参照されていない場合のみ。 */
export async function deleteStorageShelf(id: number): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const before = await prisma.storageShelf.findUnique({
      where: { id },
      include: { location: { select: { factoryId: true } } },
    });
    if (!before) return actionError("対象の棚が見つかりません");
    const [prodRefs, matRefs] = await Promise.all([
      prisma.productInventory.count({ where: { shelfId: id } }),
      prisma.materialInventory.count({ where: { shelfId: id } }),
    ]);
    if (prodRefs + matRefs > 0) {
      return actionError(
        "この棚を参照する在庫があるため削除できません（在庫移動で空にするか、無効化してください）",
      );
    }
    await prisma.storageShelf.delete({ where: { id } });
    await recordAudit({
      action: "DELETE",
      tableName: "storage_shelves",
      recordId: String(id),
      before: { code: before.code },
    });
    revalidate(before.location.factoryId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "棚の削除に失敗しました"));
  }
}
