"use server";

/**
 * Server Actions — 保管場所マスタ（MS0E /master/storage-locations）。
 *
 * 保管場所（storage_locations = 拠点内の倉庫・置場）と棚（storage_shelves）を
 * 保管場所アプリからモーダルで CRUD する。在庫（product/material_inventory）が
 * 参照する場所・棚は削除できない（FK RESTRICT → prismaErrorMessage）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
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

function locationInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    code: z
      .string()
      .min(1, tr("common.codeRequired"))
      .regex(codePattern, tr("master.storageLocationActions.codeFormat")),
    nameJa: z.string().min(1, tr("common.nameJaRequired")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    notes: z.string().optional(),
  });
}

function shelfInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    code: z
      .string()
      .min(1, tr("master.storageLocationActions.shelfCodeRequired"))
      .regex(codePattern, tr("master.storageLocationActions.codeFormat")),
    nameJa: z.string().optional(),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
  });
}

/** 新規作成は拠点必須 + フロア（マップ）任意 — 一覧ビューからも作成できる。 */
function locationCreateInputSchema(
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
  return locationInputSchema(tr).extend({
    plantId: z.number().int().positive(tr("master.locationModal.selectASite")),
    floorMapId: z
      .string()
      .uuid(tr("master.storageLocationActions.invalidFloorMapSpecified"))
      .nullable()
      .optional(),
  });
}

export type StorageLocationInput = z.infer<
  ReturnType<typeof locationInputSchema>
>;
export type StorageLocationCreateInput = z.infer<
  ReturnType<typeof locationCreateInputSchema>
>;
export type StorageShelfInput = z.infer<ReturnType<typeof shelfInputSchema>>;

function revalidate() {
  revalidatePath("/master/storage-locations");
  revalidatePath("/production/inventory");
}

// ── 保管場所 ─────────────────────────────────────────────────────────────────

export async function createStorageLocation(
  input: StorageLocationCreateInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = locationCreateInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const plant = await prisma.plant.findUnique({
      where: { id: v.plantId },
      select: { id: true, isActive: true },
    });
    if (!plant) {
      return actionError(tr("master.storageLocationActions.plantNotFound"));
    }
    if (!plant.isActive) {
      return actionError(tr("master.storageLocationActions.plantInactive"));
    }
    // フロア指定時は、そのフロアマップが選択拠点のものであることを検証
    if (v.floorMapId) {
      const map = await prisma.kioskFloorMap.findUnique({
        where: { id: v.floorMapId },
        select: { plantId: true, isActive: true },
      });
      if (!map || !map.isActive || map.plantId !== v.plantId) {
        return actionError(
          tr("master.storageLocationActions.floorMapPlantMismatch"),
        );
      }
    }
    const created = await prisma.storageLocation.create({
      data: {
        plantId: v.plantId,
        code: v.code.trim(),
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.storageLocationActions.createFailed"),
        tr,
      ),
    );
  }
}

export async function updateStorageLocation(
  id: number,
  input: StorageLocationInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = locationInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const before = await prisma.storageLocation.findUnique({ where: { id } });
    if (!before) {
      return actionError(tr("master.storageLocationActions.locationNotFound"));
    }
    await prisma.storageLocation.update({
      where: { id },
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.storageLocationActions.updateFailed"),
        tr,
      ),
    );
  }
}

/** 保管場所の削除 — 在庫・棚から参照されていない場合のみ（棚は同時削除）。 */
export async function deleteStorageLocation(id: number): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const before = await prisma.storageLocation.findUnique({
      where: { id },
      include: { shelves: { select: { id: true } } },
    });
    if (!before) {
      return actionError(tr("master.storageLocationActions.locationNotFound"));
    }
    const [prodRefs, matRefs] = await Promise.all([
      prisma.productInventory.count({ where: { storageLocationId: id } }),
      prisma.materialInventory.count({ where: { storageLocationId: id } }),
    ]);
    if (prodRefs + matRefs > 0) {
      return actionError(
        tr("master.storageLocationActions.locationHasInventoryRefs"),
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.storageLocationActions.deleteFailed"),
        tr,
      ),
    );
  }
}

// ── フロアマップ配置 ─────────────────────────────────────────────────────────

function placeInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    id: z.number().int().positive(),
    floorMapId: z
      .string()
      .uuid(tr("master.storageLocationActions.invalidFloorMapSpecified")),
    mapX: z.number().min(0).max(100),
    mapY: z.number().min(0).max(100),
  });
}

/** 保管場所をフロアマップ（端末管理と共用の拠点図面）に %座標で配置する。 */
export async function placeStorageLocation(input: {
  id: number;
  floorMapId: string;
  mapX: number;
  mapY: number;
}): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = placeInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
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
    if (!location) {
      return actionError(tr("master.storageLocationActions.locationNotFound"));
    }
    if (!map || !map.isActive || map.plantId !== location.plantId) {
      return actionError(
        tr("master.storageLocationActions.floorMapLocationMismatch"),
      );
    }
    await prisma.storageLocation.update({
      where: { id: v.id },
      data: { floorMapId: v.floorMapId, mapX: v.mapX, mapY: v.mapY },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.storageLocationActions.placeFailed"),
        tr,
      ),
    );
  }
}

/** 保管場所のフロアマップピンを外す。 */
export async function unplaceStorageLocation(
  id: number,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const location = await prisma.storageLocation.findUnique({
      where: { id },
      select: { plantId: true },
    });
    if (!location) {
      return actionError(tr("master.storageLocationActions.locationNotFound"));
    }
    await prisma.storageLocation.update({
      where: { id },
      data: { floorMapId: null, mapX: null, mapY: null },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.storageLocationActions.unpinFailed"),
        tr,
      ),
    );
  }
}

// ── 棚 ───────────────────────────────────────────────────────────────────────

export async function createStorageShelf(
  locationId: number,
  input: StorageShelfInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = shelfInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const location = await prisma.storageLocation.findUnique({
      where: { id: locationId },
      select: { plantId: true },
    });
    if (!location) {
      return actionError(tr("master.storageLocationActions.locationNotFound"));
    }
    const created = await prisma.storageShelf.create({
      data: {
        locationId,
        code: v.code.trim(),
        name:
          localizedInputOrNull(v.nameJa, undefined, v.nameTranslations) ??
          Prisma.DbNull,
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.storageLocationActions.shelfCreateFailed"),
        tr,
      ),
    );
  }
}

export async function updateStorageShelf(
  id: number,
  input: StorageShelfInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = shelfInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const before = await prisma.storageShelf.findUnique({
      where: { id },
      include: { location: { select: { plantId: true } } },
    });
    if (!before) {
      return actionError(tr("master.storageLocationActions.shelfNotFound"));
    }
    await prisma.storageShelf.update({
      where: { id },
      data: {
        code: v.code.trim(),
        name:
          localizedInputOrNull(v.nameJa, undefined, v.nameTranslations) ??
          Prisma.DbNull,
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.storageLocationActions.shelfUpdateFailed"),
        tr,
      ),
    );
  }
}

/** 棚の削除 — 在庫から参照されていない場合のみ。 */
export async function deleteStorageShelf(id: number): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const before = await prisma.storageShelf.findUnique({
      where: { id },
      include: { location: { select: { plantId: true } } },
    });
    if (!before) {
      return actionError(tr("master.storageLocationActions.shelfNotFound"));
    }
    const [prodRefs, matRefs] = await Promise.all([
      prisma.productInventory.count({ where: { shelfId: id } }),
      prisma.materialInventory.count({ where: { shelfId: id } }),
    ]);
    if (prodRefs + matRefs > 0) {
      return actionError(
        tr("master.storageLocationActions.shelfHasInventoryRefs"),
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
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.storageLocationActions.shelfDeleteFailed"),
        tr,
      ),
    );
  }
}
