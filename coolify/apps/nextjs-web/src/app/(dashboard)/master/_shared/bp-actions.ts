"use server";

/**
 * bp-actions.ts — BP master 共通の Server Actions（顧客/最終需要家/外注企業）。
 *
 * 有効・無効切替 / 削除 / 担当者追加は bp.business_partners レベルで共通。
 * 削除は販売ドキュメント（価格試算・価格表・見積書）と支店の参照ガード付きで、
 * ロール割当・属性・担当者をトランザクションで併せて削除する。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { countMasterReferences } from "@/lib/master-refs";
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
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
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
    return actionError(
      prismaErrorMessage(e, tr("common.statusUpdateFailed"), tr),
    );
  }
}

export async function deleteBps(ids: string[]): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  if (ids.length === 0) return actionError(tr("common.noTargetSelected"));
  try {
    // Guard: 支店があれば先に別文言で止める（支店を消してからでないと消せない）。
    const branches = await prisma.businessPartner.count({
      where: { parentId: { in: ids } },
    });
    if (branches > 0) {
      return actionError(tr("master.bpActions.branchesExistCannotDelete"));
    }
    // Guard: どのロールで使われていても参照があれば消させない
    // （顧客・支店としての販売書類 / 需要家 / 仕入先・外注先としての購買・工程 /
    //  設計・工程ルート・請求先・ポータル）。多くは SET NULL で DB が止めない
    // ので、数える関連は lib/master-refs が 1 か所で持つ。
    const refs = await countMasterReferences("businessPartner", ids);
    if (refs.total > 0) {
      return actionError(tr("master.bpActions.referencedCannotDelete"));
    }
    const targets = await prisma.businessPartner.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    await prisma.$transaction([
      prisma.bpContact.deleteMany({ where: { bpId: { in: ids } } }),
      prisma.bpRoleAssignment.deleteMany({ where: { bpId: { in: ids } } }),
      prisma.bpCustomerAttrs.deleteMany({ where: { bpId: { in: ids } } }),
      // FK は ON DELETE CASCADE だが、他の子行と同じく明示的に消す。
      prisma.bpSalesRep.deleteMany({ where: { bpId: { in: ids } } }),
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
    return actionError(
      prismaErrorMessage(e, tr("master.bpActions.deleteFailed"), tr),
    );
  }
}

export async function addContact(
  bpId: string,
  input: ContactInput,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = contactInput(tr).safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
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
    return actionError(
      prismaErrorMessage(e, tr("master.bpActions.addContactFailed"), tr),
    );
  }
}

export async function deleteContact(
  bpId: string,
  contactId: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.bpContact.delete({ where: { id: contactId } });
    revalidateBp([bpId]);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("master.bpActions.deleteContactFailed"), tr),
    );
  }
}
