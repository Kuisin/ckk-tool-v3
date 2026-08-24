"use server";

/**
 * Server Actions — 拠点マスタ (MS0C).
 *
 * 拠点コードは手入力（unique）。識別子のため作成後は変更しない
 * （updatePlant では書き換えない）。住所は { ja, en } JSON（任意）。
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

const BASE_PATH = "/master/plants";

const plantInput = z.object({
  code: z.string().min(1, "拠点コードを入力してください"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  nameKana: z.string().optional(),
  countryCode: z.string().nullable(),
  regionId: z.number().int().positive().nullable(),
  postalCode: z.string().optional(),
  addressJa: z.string().optional(),
  addressEn: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .or(z.literal(""))
    .optional(),
  contactPerson: z.string().optional(),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

export type PlantInput = z.infer<typeof plantInput>;

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

/** 共通カラム（create/update 共用。code は create のみ別途設定）。 */
function plantData(v: PlantInput) {
  return {
    name: localizedInput(v.nameJa, v.nameEn),
    nameKana: v.nameKana?.trim() || null,
    countryCode: v.countryCode,
    regionId: v.regionId,
    postalCode: v.postalCode?.trim() || null,
    address: localizedInputOrNull(v.addressJa, v.addressEn) ?? Prisma.DbNull,
    phone: v.phone?.trim() || null,
    email: v.email?.trim() || null,
    contactPerson: v.contactPerson?.trim() || null,
    isActive: v.isActive,
    notes: v.notes?.trim() || null,
  };
}

/** 監査ログ用スナップショット（差分表示のためスカラーのみ）。 */
function auditSnapshot(v: PlantInput) {
  return {
    code: v.code.trim(),
    nameJa: v.nameJa,
    countryCode: v.countryCode,
    regionId: v.regionId,
    postalCode: v.postalCode?.trim() || null,
    addressJa: v.addressJa?.trim() || null,
    phone: v.phone?.trim() || null,
    email: v.email?.trim() || null,
    contactPerson: v.contactPerson?.trim() || null,
    isActive: v.isActive,
    notes: v.notes?.trim() || null,
  };
}

export async function createPlant(
  input: PlantInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = plantInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.plant.create({
      data: { code: v.code.trim(), ...plantData(v) },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "plants",
      recordId: String(created.id),
      after: auditSnapshot(v),
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "拠点の作成に失敗しました"));
  }
}

export async function updatePlant(
  id: number,
  input: PlantInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = plantInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.plant.findUnique({
      where: { id },
      select: {
        countryCode: true,
        regionId: true,
        postalCode: true,
        phone: true,
        email: true,
        contactPerson: true,
        isActive: true,
        notes: true,
      },
    });
    // code は識別子のため更新対象に含めない。
    await prisma.plant.update({ where: { id }, data: plantData(v) });
    await recordAudit({
      action: "UPDATE",
      tableName: "plants",
      recordId: String(id),
      before: prior ?? undefined,
      after: auditSnapshot(v),
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "拠点の更新に失敗しました"));
  }
}

export async function setPlantsActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.plant.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "plants",
        recordId: String(id),
        after: { isActive },
      });
    }
    revalidate();
    for (const id of ids) revalidatePath(`${BASE_PATH}/${id}`);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

// ── 地域（regions — REGION スコープの実体） ──────────────────────────────────

const REGIONS_PATH = "/master/plants/regions";

const regionInput = z.object({
  code: z.string().min(1, "地域コードを入力してください"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  isActive: z.boolean(),
});

export type RegionInput = z.infer<typeof regionInput>;

function revalidateRegions() {
  revalidatePath(REGIONS_PATH);
  revalidatePath(BASE_PATH);
}

export async function createRegion(
  input: RegionInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = regionInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.region.create({
      data: {
        code: v.code.trim(),
        name: localizedInput(v.nameJa, v.nameEn),
        isActive: v.isActive,
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "regions",
      recordId: String(created.id),
      after: { code: v.code.trim(), nameJa: v.nameJa, isActive: v.isActive },
    });
    revalidateRegions();
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "地域の作成に失敗しました"));
  }
}

export async function updateRegion(
  id: number,
  input: RegionInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = regionInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.region.findUnique({
      where: { id },
      select: { code: true, name: true, isActive: true },
    });
    if (!prior) return actionError("対象の地域が見つかりません");
    // code は識別子（authz-core の scope_values が参照）のため更新しない。
    await prisma.region.update({
      where: { id },
      data: {
        name: localizedInput(v.nameJa, v.nameEn),
        isActive: v.isActive,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "regions",
      recordId: String(id),
      before: {
        code: prior.code,
        name: prior.name,
        isActive: prior.isActive,
      },
      after: { nameJa: v.nameJa, isActive: v.isActive },
    });
    revalidateRegions();
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "地域の更新に失敗しました"));
  }
}

export async function setRegionActive(
  id: number,
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.region.update({ where: { id }, data: { isActive } });
    await recordAudit({
      action: "UPDATE",
      tableName: "regions",
      recordId: String(id),
      after: { isActive },
    });
    revalidateRegions();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

/** 削除 — 拠点から参照されていない地域のみ。 */
export async function deleteRegion(id: number): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const plantCount = await prisma.plant.count({ where: { regionId: id } });
    if (plantCount > 0) {
      return actionError(
        `この地域は ${plantCount} 件の拠点から参照されているため削除できません（先に拠点の地域を変更してください）`,
      );
    }
    await prisma.region.delete({ where: { id } });
    await recordAudit({
      action: "DELETE",
      tableName: "regions",
      recordId: String(id),
    });
    revalidateRegions();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "地域の削除に失敗しました"));
  }
}

export async function deletePlants(ids: number[]): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // Guard: 現時点で拠点を参照するテーブルは未実装（在庫・工程ステップは後続）。
    // 参照テーブルが増えたら products と同様の count ガードを追加する。
    // FK 違反は P2003 として prismaErrorMessage が日本語メッセージに変換する。
    await prisma.plant.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "plants",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "拠点の削除に失敗しました"));
  }
}
