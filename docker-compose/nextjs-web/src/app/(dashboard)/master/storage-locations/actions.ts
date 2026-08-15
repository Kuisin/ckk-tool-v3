"use server";

/**
 * Server Actions — 保管場所マスタ（MS0E /master/storage-locations）。
 *
 * 保管場所（storage_locations = 拠点内の倉庫・置場）と棚（storage_shelves）を
 * 保管場所アプリからモーダルで CRUD する。在庫（product/material_inventory）が
 * 参照する場所・棚は削除できない（FK RESTRICT → prismaErrorMessage）。
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

/** 新規作成は拠点必須 + フロア（マップ）任意 — 一覧ビューからも作成できる。 */
const locationCreateInput = locationInput.extend({
  plantId: z.number().int().positive("拠点を選択してください"),
  floorMapId: z
    .string()
    .uuid("フロアマップの指定が不正です")
    .nullable()
    .optional(),
});

export type StorageLocationInput = z.infer<typeof locationInput>;
export type StorageLocationCreateInput = z.infer<typeof locationCreateInput>;
export type StorageShelfInput = z.infer<typeof shelfInput>;

function revalidate() {
  revalidatePath("/master/storage-locations");
  revalidatePath("/production/inventory");
}

// ── 保管場所 ─────────────────────────────────────────────────────────────────

export async function createStorageLocation(
  input: StorageLocationCreateInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = locationCreateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const plant = await prisma.plant.findUnique({
      where: { id: v.plantId },
      select: { id: true, isActive: true },
    });
    if (!plant) return actionError("対象の拠点が見つかりません");
    if (!plant.isActive) return actionError("無効な拠点には追加できません");
    // フロア指定時は、そのフロアマップが選択拠点のものであることを検証
    if (v.floorMapId) {
      const map = await prisma.kioskFloorMap.findUnique({
        where: { id: v.floorMapId },
        select: { plantId: true, isActive: true },
      });
      if (!map || !map.isActive || map.plantId !== v.plantId) {
        return actionError("フロアマップが選択した拠点と一致しません");
      }
    }
    const created = await prisma.storageLocation.create({
      data: {
        plantId: v.plantId,
        code: v.code.trim(),
        name: localizedInput(v.nameJa, v.nameEn),
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
        // フロア指定時はマップ中央 (50%, 50%) に仮配置 — MS0E の
        // フロアマップ配置パネルでドラッグして位置を調整する
        floorMapId: v.floorMapId ?? null,
        mapX: v.floorMapId ? 50 : null,
        mapY: v.floorMapId ? 50 : null,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "storage_locations",
      recordId: String(created.id),
      after: {
        plantId: v.plantId,
        code: v.code.trim(),
        nameJa: v.nameJa,
        floorMapId: v.floorMapId ?? null,
      },
    });
    revalidate();
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
    revalidate();
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
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "保管場所の削除に失敗しました"));
  }
}

// ── フロアマップ配置 ─────────────────────────────────────────────────────────

const placeInput = z.object({
  id: z.number().int().positive(),
  floorMapId: z.string().uuid("フロアマップの指定が不正です"),
  mapX: z.number().min(0).max(100),
  mapY: z.number().min(0).max(100),
});

/** 保管場所をフロアマップ（端末管理と共用の拠点図面）に %座標で配置する。 */
export async function placeStorageLocation(input: {
  id: number;
  floorMapId: string;
  mapX: number;
  mapY: number;
}): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = placeInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const [location, map] = await Promise.all([
      prisma.storageLocation.findUnique({
        where: { id: v.id },
        select: { plantId: true },
      }),
      prisma.kioskFloorMap.findUnique({
        where: { id: v.floorMapId },
        select: { plantId: true, isActive: true },
      }),
    ]);
    if (!location) return actionError("対象の保管場所が見つかりません");
    if (!map || !map.isActive || map.plantId !== location.plantId) {
      return actionError("フロアマップが保管場所の拠点と一致しません");
    }
    await prisma.storageLocation.update({
      where: { id: v.id },
      data: { floorMapId: v.floorMapId, mapX: v.mapX, mapY: v.mapY },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "配置に失敗しました"));
  }
}

/** 保管場所のフロアマップピンを外す。 */
export async function unplaceStorageLocation(
  id: number,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const location = await prisma.storageLocation.findUnique({
      where: { id },
      select: { plantId: true },
    });
    if (!location) return actionError("対象の保管場所が見つかりません");
    await prisma.storageLocation.update({
      where: { id },
      data: { floorMapId: null, mapX: null, mapY: null },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "ピン解除に失敗しました"));
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
      select: { plantId: true },
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
    revalidate();
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
      include: { location: { select: { plantId: true } } },
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
    revalidate();
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
      include: { location: { select: { plantId: true } } },
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
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "棚の削除に失敗しました"));
  }
}
