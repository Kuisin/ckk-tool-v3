"use server";

/**
 * Server Actions — 作業場所マスタ (MS0D)。
 *
 * 単一管理画面（MS07 採番構成と同型 — list コードのみ）: グループと配下の
 * 場所をモーダルで CRUD する。種別は system_settings `work_location.types`
 * の管理者定義（lib/work-locations.ts — 組み込み machine/area は削除不可）。
 * 作業計画（work_order_step_plans）が参照する場所は削除できない（P2003）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  localizedInput,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  BUILTIN_TYPES,
  readWorkLocationTypes,
  writeWorkLocationTypes,
} from "@/lib/work-locations";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

const BASE_PATH = "/master/work-locations";

const codePattern = /^[A-Za-z0-9_-]+$/;

function groupInputSchema(tr: Tr) {
  return z.object({
    code: z
      .string()
      .min(1, tr("common.codeRequired"))
      .regex(codePattern, tr("master.workLocationsActions.codePatternHint")),
    nameJa: z.string().min(1, tr("common.enterNameInJapanese")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    typeKey: z.string().min(1, tr("master.workLocationsActions.selectType")),
    plantId: z.number().int().positive().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    notes: z.string().optional(),
  });
}

function locationInputSchema(tr: Tr) {
  return z.object({
    code: z
      .string()
      .min(1, tr("common.codeRequired"))
      .regex(codePattern, tr("master.workLocationsActions.codePatternHint")),
    nameJa: z.string().min(1, tr("common.enterNameInJapanese")),
    nameTranslations: z.record(z.string(), z.string()).optional(),
    capacity: z.number().int().min(1).nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    notes: z.string().optional(),
  });
}

export type WorkLocationGroupInput = z.infer<
  ReturnType<typeof groupInputSchema>
>;
export type WorkLocationInput = z.infer<ReturnType<typeof locationInputSchema>>;

function revalidate() {
  revalidatePath(BASE_PATH);
}

async function ensureTypeKey(tr: Tr, typeKey: string): Promise<string | null> {
  const types = await readWorkLocationTypes();
  return types.some((t) => t.key === typeKey)
    ? null
    : tr("master.workLocationsActions.unknownType");
}

// ── グループ ─────────────────────────────────────────────────────────────────

export async function createWorkLocationGroup(
  input: WorkLocationGroupInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const typeError = await ensureTypeKey(tr, v.typeKey);
  if (typeError) return actionError(typeError);
  try {
    const created = await prisma.workLocationGroup.create({
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        typeKey: v.typeKey,
        plantId: v.plantId,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "work_location_groups",
      recordId: String(created.id),
      after: { code: v.code.trim(), nameJa: v.nameJa, typeKey: v.typeKey },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.workLocationsActions.createGroupFailed"),
        tr,
      ),
    );
  }
}

export async function updateWorkLocationGroup(
  id: number,
  input: WorkLocationGroupInput,
): Promise<ActionResult<{ id: number }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupInputSchema(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  const typeError = await ensureTypeKey(tr, v.typeKey);
  if (typeError) return actionError(typeError);
  try {
    await prisma.workLocationGroup.update({
      where: { id },
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        typeKey: v.typeKey,
        plantId: v.plantId,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_location_groups",
      recordId: String(id),
      after: { code: v.code.trim(), nameJa: v.nameJa, typeKey: v.typeKey },
    });
    revalidate();
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.workLocationsActions.updateGroupFailed"),
        tr,
      ),
    );
  }
}

export async function deleteWorkLocationGroup(
  id: number,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    // 配下の場所は onDelete: Cascade。計画が参照する場所があると P2003 で拒否。
    await prisma.workLocationGroup.delete({ where: { id } });
    await recordAudit({
      action: "DELETE",
      tableName: "work_location_groups",
      recordId: String(id),
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.workLocationsActions.deleteGroupFailed"),
        tr,
      ),
    );
  }
}

// ── 場所 ─────────────────────────────────────────────────────────────────────

export async function addWorkLocation(
  groupId: number,
  input: WorkLocationInput,
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
    const created = await prisma.workLocation.create({
      data: {
        groupId,
        code: v.code.trim(),
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        capacity: v.capacity,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_location_groups",
      recordId: String(groupId),
      after: { note: `作業場所「${v.nameJa}」を追加` },
    });
    revalidate();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.workLocationsActions.addLocationFailed"),
        tr,
      ),
    );
  }
}

export async function updateWorkLocation(
  id: number,
  input: WorkLocationInput,
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
    const prior = await prisma.workLocation.findUnique({
      where: { id },
      select: { groupId: true },
    });
    if (!prior)
      return actionError(tr("master.workLocationsActions.locationNotFound"));
    await prisma.workLocation.update({
      where: { id },
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, undefined, v.nameTranslations),
        capacity: v.capacity,
        sortOrder: v.sortOrder,
        isActive: v.isActive,
        notes: v.notes?.trim() || null,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_location_groups",
      recordId: String(prior.groupId),
      after: { note: `作業場所「${v.nameJa}」を更新` },
    });
    revalidate();
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.workLocationsActions.updateLocationFailed"),
        tr,
      ),
    );
  }
}

export async function deleteWorkLocation(id: number): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.workLocation.findUnique({
      where: { id },
      select: {
        groupId: true,
        name: true,
        _count: {
          select: { stepPlans: true, stepActuals: true, kioskDevices: true },
        },
      },
    });
    if (!prior)
      return actionError(tr("master.workLocationsActions.locationNotFound"));
    // FK は SET NULL なので DB は削除を止めない — 使用中はここで拒否する
    // （計画・実績の記録を黙って失わせない。端末の既定作業場所も同様）。
    const used: string[] = [];
    if (prior._count.stepPlans > 0)
      used.push(
        tr("master.workLocationsActions.usedByStepPlans", {
          count: prior._count.stepPlans,
        }),
      );
    if (prior._count.stepActuals > 0)
      used.push(
        tr("master.workLocationsActions.usedByStepActuals", {
          count: prior._count.stepActuals,
        }),
      );
    if (prior._count.kioskDevices > 0)
      used.push(
        tr("master.workLocationsActions.usedByKioskDevices", {
          count: prior._count.kioskDevices,
        }),
      );
    if (used.length > 0) {
      return actionError(
        tr("master.workLocationsActions.locationInUseCannotDelete", {
          details: used.join(" / "),
        }),
      );
    }
    await prisma.workLocation.delete({ where: { id } });
    await recordAudit({
      action: "UPDATE",
      tableName: "work_location_groups",
      recordId: String(prior.groupId),
      after: { note: "作業場所を削除" },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.workLocationsActions.deleteLocationFailed"),
        tr,
      ),
    );
  }
}

// ── 種別（管理者定義 — system_settings work_location.types） ─────────────────

function typeInputSchema(tr: Tr) {
  return z.object({
    key: z
      .string()
      .min(1, tr("master.workLocationsActions.enterKey"))
      .regex(
        /^[a-z][a-z0-9_-]*$/,
        tr("master.workLocationsActions.keyPatternHint"),
      ),
    labelJa: z.string().min(1, tr("master.workLocationsActions.enterLabelJa")),
    labelEn: z.string().optional(),
  });
}

export async function saveWorkLocationTypes(
  input: z.infer<ReturnType<typeof typeInputSchema>>[],
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = z.array(typeInputSchema(tr)).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const custom = parsed.data.filter(
    (t) => !BUILTIN_TYPES.some((b) => b.key === t.key),
  );
  const keys = custom.map((t) => t.key);
  if (new Set(keys).size !== keys.length) {
    return actionError(tr("master.workLocationsActions.duplicateTypeKey"));
  }
  try {
    // 使用中の種別は削除不可（グループ or 工程マスタの許可作業場所が参照）
    const keptKeys = [...BUILTIN_TYPES.map((b) => b.key), ...keys];
    const [inUse, inUseByCatalog] = await Promise.all([
      prisma.workLocationGroup.findMany({
        where: { typeKey: { notIn: keptKeys } },
        select: { typeKey: true },
        distinct: ["typeKey"],
      }),
      prisma.processStepWorkLocation.findMany({
        where: { typeKey: { notIn: keptKeys, not: null } },
        select: { typeKey: true },
        distinct: ["typeKey"],
      }),
    ]);
    const usedKeys = [
      ...new Set([
        ...inUse.map((g) => g.typeKey),
        ...inUseByCatalog.map((l) => l.typeKey ?? ""),
      ]),
    ].filter(Boolean);
    if (usedKeys.length > 0) {
      return actionError(
        tr("master.workLocationsActions.typeInUseCannotDelete", {
          keys: usedKeys.join(", "),
        }),
      );
    }
    await writeWorkLocationTypes(
      custom.map((t) => ({
        key: t.key,
        label: { ja: t.labelJa, en: t.labelEn ?? "" },
      })),
    );
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "work_location.types",
      after: { keys },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.workLocationsActions.saveTypesFailed"),
        tr,
      ),
    );
  }
}
