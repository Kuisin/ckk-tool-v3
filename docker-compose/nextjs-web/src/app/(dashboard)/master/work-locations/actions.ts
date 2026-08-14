"use server";

/**
 * Server Actions — 作業場所マスタ (MS0D)。
 *
 * 単一管理画面（MS0C 採番構成と同型 — list コードのみ）: グループと配下の
 * 場所をモーダルで CRUD する。種別は system_settings `work_location.types`
 * の管理者定義（lib/work-locations.ts — 組み込み machine/area は削除不可）。
 * 作業計画（work_order_step_plans）が参照する場所は削除できない（P2003）。
 */

import { revalidatePath } from "next/cache";
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

const BASE_PATH = "/master/work-locations";

const codePattern = /^[A-Za-z0-9_-]+$/;

const groupInput = z.object({
  code: z
    .string()
    .min(1, "コードを入力してください")
    .regex(codePattern, "コードは英数字・ハイフン・アンダースコアで入力"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  typeKey: z.string().min(1, "種別を選択してください"),
  plantId: z.number().int().positive().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

const locationInput = z.object({
  code: z
    .string()
    .min(1, "コードを入力してください")
    .regex(codePattern, "コードは英数字・ハイフン・アンダースコアで入力"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  capacity: z.number().int().min(1).nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

export type WorkLocationGroupInput = z.infer<typeof groupInput>;
export type WorkLocationInput = z.infer<typeof locationInput>;

function revalidate() {
  revalidatePath(BASE_PATH);
}

async function ensureTypeKey(typeKey: string): Promise<string | null> {
  const types = await readWorkLocationTypes();
  return types.some((t) => t.key === typeKey)
    ? null
    : "存在しない種別です（先に種別を追加してください）";
}

// ── グループ ─────────────────────────────────────────────────────────────────

export async function createWorkLocationGroup(
  input: WorkLocationGroupInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const typeError = await ensureTypeKey(v.typeKey);
  if (typeError) return actionError(typeError);
  try {
    const created = await prisma.workLocationGroup.create({
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, v.nameEn),
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
    return actionError(prismaErrorMessage(e, "グループの作成に失敗しました"));
  }
}

export async function updateWorkLocationGroup(
  id: number,
  input: WorkLocationGroupInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = groupInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const typeError = await ensureTypeKey(v.typeKey);
  if (typeError) return actionError(typeError);
  try {
    await prisma.workLocationGroup.update({
      where: { id },
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, v.nameEn),
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
    return actionError(prismaErrorMessage(e, "グループの更新に失敗しました"));
  }
}

export async function deleteWorkLocationGroup(
  id: number,
): Promise<ActionResult> {
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
        "グループの削除に失敗しました（作業計画で使用中の場所が含まれる場合は削除できません）",
      ),
    );
  }
}

// ── 場所 ─────────────────────────────────────────────────────────────────────

export async function addWorkLocation(
  groupId: number,
  input: WorkLocationInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = locationInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.workLocation.create({
      data: {
        groupId,
        code: v.code.trim(),
        name: localizedInput(v.nameJa, v.nameEn),
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
    return actionError(prismaErrorMessage(e, "作業場所の追加に失敗しました"));
  }
}

export async function updateWorkLocation(
  id: number,
  input: WorkLocationInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = locationInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.workLocation.findUnique({
      where: { id },
      select: { groupId: true },
    });
    if (!prior) return actionError("対象の作業場所が見つかりません");
    await prisma.workLocation.update({
      where: { id },
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, v.nameEn),
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
    return actionError(prismaErrorMessage(e, "作業場所の更新に失敗しました"));
  }
}

export async function deleteWorkLocation(id: number): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const prior = await prisma.workLocation.findUnique({
      where: { id },
      select: { groupId: true, name: true },
    });
    if (!prior) return actionError("対象の作業場所が見つかりません");
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
        "作業場所の削除に失敗しました（作業計画で使用中は削除できません）",
      ),
    );
  }
}

// ── 種別（管理者定義 — system_settings work_location.types） ─────────────────

const typeInput = z.object({
  key: z
    .string()
    .min(1, "キーを入力してください")
    .regex(/^[a-z][a-z0-9_-]*$/, "キーは小文字英数字・-・_ で入力"),
  labelJa: z.string().min(1, "表示名（日本語）を入力してください"),
  labelEn: z.string().optional(),
});

export async function saveWorkLocationTypes(
  input: z.infer<typeof typeInput>[],
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = z.array(typeInput).safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const custom = parsed.data.filter(
    (t) => !BUILTIN_TYPES.some((b) => b.key === t.key),
  );
  const keys = custom.map((t) => t.key);
  if (new Set(keys).size !== keys.length) {
    return actionError("種別キーが重複しています");
  }
  try {
    // 使用中の種別は削除不可（グループが参照している custom キー）
    const inUse = await prisma.workLocationGroup.findMany({
      where: {
        typeKey: { notIn: [...BUILTIN_TYPES.map((b) => b.key), ...keys] },
      },
      select: { typeKey: true },
      distinct: ["typeKey"],
    });
    if (inUse.length > 0) {
      return actionError(
        `使用中の種別は削除できません: ${inUse.map((g) => g.typeKey).join(", ")}`,
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
    return actionError(prismaErrorMessage(e, "種別の保存に失敗しました"));
  }
}
