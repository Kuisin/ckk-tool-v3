"use server";

/**
 * Server Actions — 工場マスタ (MS0B).
 *
 * 工場コードは手入力（unique）。識別子のため作成後は変更しない
 * （updateFactory では書き換えない）。住所は { ja, en } JSON（任意）。
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

const BASE_PATH = "/master/factories";

const factoryInput = z.object({
  code: z.string().min(1, "工場コードを入力してください"),
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  nameKana: z.string().optional(),
  countryCode: z.string().nullable(),
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

export type FactoryInput = z.infer<typeof factoryInput>;

function revalidate(id?: number) {
  revalidatePath(BASE_PATH);
  if (id != null) revalidatePath(`${BASE_PATH}/${id}`);
}

/** 共通カラム（create/update 共用。code は create のみ別途設定）。 */
function factoryData(v: FactoryInput) {
  return {
    name: localizedInput(v.nameJa, v.nameEn),
    nameKana: v.nameKana?.trim() || null,
    countryCode: v.countryCode,
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
function auditSnapshot(v: FactoryInput) {
  return {
    code: v.code.trim(),
    nameJa: v.nameJa,
    countryCode: v.countryCode,
    postalCode: v.postalCode?.trim() || null,
    addressJa: v.addressJa?.trim() || null,
    phone: v.phone?.trim() || null,
    email: v.email?.trim() || null,
    contactPerson: v.contactPerson?.trim() || null,
    isActive: v.isActive,
    notes: v.notes?.trim() || null,
  };
}

export async function createFactory(
  input: FactoryInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = factoryInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.factory.create({
      data: { code: v.code.trim(), ...factoryData(v) },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "factories",
      recordId: String(created.id),
      after: auditSnapshot(v),
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "工場の作成に失敗しました"));
  }
}

export async function updateFactory(
  id: number,
  input: FactoryInput,
): Promise<ActionResult<{ id: number }>> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = factoryInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const prior = await prisma.factory.findUnique({
      where: { id },
      select: {
        countryCode: true,
        postalCode: true,
        phone: true,
        email: true,
        contactPerson: true,
        isActive: true,
        notes: true,
      },
    });
    // code は識別子のため更新対象に含めない。
    await prisma.factory.update({ where: { id }, data: factoryData(v) });
    await recordAudit({
      action: "UPDATE",
      tableName: "factories",
      recordId: String(id),
      before: prior ?? undefined,
      after: auditSnapshot(v),
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "工場の更新に失敗しました"));
  }
}

export async function setFactoriesActive(
  ids: number[],
  isActive: boolean,
): Promise<ActionResult> {
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    await prisma.factory.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "factories",
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

export async function deleteFactories(ids: number[]): Promise<ActionResult> {
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // Guard: 現時点で工場を参照するテーブルは未実装（在庫・工程ステップは後続）。
    // 参照テーブルが増えたら products と同様の count ガードを追加する。
    // FK 違反は P2003 として prismaErrorMessage が日本語メッセージに変換する。
    await prisma.factory.deleteMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      await recordAudit({
        action: "DELETE",
        tableName: "factories",
        recordId: String(id),
      });
    }
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "工場の削除に失敗しました"));
  }
}
