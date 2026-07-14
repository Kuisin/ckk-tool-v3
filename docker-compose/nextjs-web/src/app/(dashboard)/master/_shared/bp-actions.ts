"use server";

/**
 * bp-actions.ts — BP master 共通の Server Actions（顧客/最終需要家/外注企業）。
 *
 * 有効・無効切替 / 削除 / 担当者追加は bp.business_partners レベルで共通。
 * 削除は販売ドキュメント（試算・価格表・見積書）と支店の参照ガード付きで、
 * ロール割当・属性・担当者をトランザクションで併せて削除する。
 */

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { BP_PATHS, type ContactInput, contactInput } from "./bp-schema";

function revalidateBp(ids: string[] = []) {
  for (const base of BP_PATHS) {
    revalidatePath(base);
    for (const id of ids) revalidatePath(`${base}/${id}`);
  }
}

export async function setBpsActive(
  ids: string[],
  isActive: boolean,
): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    const priors = await prisma.businessPartner.findMany({
      where: { id: { in: ids } },
      select: { id: true, isActive: true },
    });
    await prisma.businessPartner.updateMany({
      where: { id: { in: ids } },
      data: { isActive },
    });
    const priorMap = new Map(priors.map((p) => [p.id, p.isActive]));
    for (const id of ids) {
      await recordAudit({
        action: "UPDATE",
        tableName: "business_partners",
        recordId: id,
        before: { isActive: priorMap.get(id) },
        after: { isActive },
      });
    }
    revalidateBp(ids);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "状態の更新に失敗しました"));
  }
}

export async function deleteBps(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return actionError("対象が選択されていません");
  try {
    // Guard: sales documents referencing one of the BPs (as 顧客 or 支店).
    const [estimates, priceListEntries, quotes, branches] = await Promise.all([
      prisma.estimate.count({ where: { customerBpId: { in: ids } } }),
      prisma.priceListEntry.count({ where: { customerBpId: { in: ids } } }),
      prisma.quote.count({
        where: {
          OR: [
            { customerBpId: { in: ids } },
            { customerBranchBpId: { in: ids } },
          ],
        },
      }),
      prisma.businessPartner.count({
        where: { parentId: { in: ids } },
      }),
    ]);
    if (estimates + priceListEntries + quotes > 0) {
      return actionError(
        "この取引先を参照するデータ（試算・価格表・見積書）が存在するため削除できません。無効化を検討してください。",
      );
    }
    if (branches > 0) {
      return actionError(
        "支店が存在するため削除できません。先に支店を削除してください。",
      );
    }
    const targets = await prisma.businessPartner.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    await prisma.$transaction([
      prisma.bpContact.deleteMany({ where: { bpId: { in: ids } } }),
      prisma.bpRoleAssignment.deleteMany({ where: { bpId: { in: ids } } }),
      prisma.bpCustomerAttrs.deleteMany({ where: { bpId: { in: ids } } }),
      prisma.bpVendorAttrs.deleteMany({ where: { bpId: { in: ids } } }),
      prisma.bpEndUserAttrs.deleteMany({ where: { bpId: { in: ids } } }),
      prisma.businessPartner.deleteMany({ where: { id: { in: ids } } }),
    ]);
    for (const t of targets) {
      await recordAudit({
        action: "DELETE",
        tableName: "business_partners",
        recordId: t.id,
        before: { nameJa: (t.name as { ja?: string } | null)?.ja ?? null },
      });
    }
    revalidateBp(ids);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "取引先の削除に失敗しました"));
  }
}

export async function addContact(
  bpId: string,
  input: ContactInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = contactInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const created = await prisma.$transaction(async (tx) => {
      if (v.isPrimary) {
        await tx.bpContact.updateMany({
          where: { bpId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.bpContact.create({
        data: {
          bpId,
          name: v.name.trim(),
          nameKana: v.nameKana?.trim() || null,
          department: v.department?.trim() || null,
          title: v.title?.trim() || null,
          email: v.email?.trim() || null,
          phone: v.phone?.trim() || null,
          isPrimary: v.isPrimary,
        },
      });
    });
    revalidateBp([bpId]);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "担当者の追加に失敗しました"));
  }
}

export async function deleteContact(
  bpId: string,
  contactId: string,
): Promise<ActionResult> {
  try {
    await prisma.bpContact.delete({ where: { id: contactId } });
    revalidateBp([bpId]);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "担当者の削除に失敗しました"));
  }
}
