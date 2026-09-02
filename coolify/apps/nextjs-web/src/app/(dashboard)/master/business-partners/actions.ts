"use server";

/**
 * Server Actions — 取引先マスタ (MS01) + 支店。
 *
 * 1 法人 = bp.business_partners 1 行。顧客 / 最終需要家 / 仕入先・外注先 は
 * ロール（bp_role_assignments）として付与し、ロール固有の情報は
 * bp_customer_attrs / bp_end_user_attrs / bp_vendor_attrs に持つ。
 *
 * ロールを外すときは割当行を消さず `is_active=false` + `deactivated_at` に落とす
 * （履歴が残り、付け直したときに属性もそのまま戻る）。
 *
 * BP コードは BP-NNNNN の全体通し採番（lib/numbering.ts）。支店は
 * `親コード-NN`（親内連番）で、parent_id 子行として保持する。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { nextSerialCode } from "@/lib/numbering";
import { syncCustomerSalesReps } from "@/lib/sales-rep";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  BP_BASE_PATH,
  BP_ROLES,
  type BpInput,
  type BpRoleValue,
  bpBaseData,
  bpBaseInput,
  bpInput,
  customerAttrsData,
  endUserAttrsData,
  vendorAttrsData,
} from "../_shared/bp-schema";

// NOTE: 型の re-export をここに置かないこと。"use server" ファイルは
// **async 関数以外を export できない**（型 re-export が生成コードに残り、
// 実行時に `ReferenceError: BpInput is not defined` で保存が失敗する）。
// 型は定義元 ../_shared/bp-schema から直接 import する。

const branchInput = bpBaseInput.extend({
  contactName: z.string().optional(),
});

export type BranchInput = z.infer<typeof branchInput>;

function revalidate(id?: string, branchId?: string) {
  revalidatePath(BP_BASE_PATH);
  if (id) revalidatePath(`${BP_BASE_PATH}/${id}`);
  if (id && branchId) {
    revalidatePath(`${BP_BASE_PATH}/${id}/branches/${branchId}`);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** 付与ロールを望みの集合に合わせる（外すのは論理無効化）。 */
async function syncRoles(tx: Tx, bpId: string, roles: BpRoleValue[]) {
  const existing = await tx.bpRoleAssignment.findMany({ where: { bpId } });
  for (const role of BP_ROLES) {
    const want = roles.includes(role);
    const current = existing.find((e) => e.role === role);
    if (want && !current) {
      await tx.bpRoleAssignment.create({ data: { bpId, role } });
    } else if (want && current && !current.isActive) {
      await tx.bpRoleAssignment.update({
        where: { id: current.id },
        data: { isActive: true, assignedAt: new Date(), deactivatedAt: null },
      });
    } else if (!want && current?.isActive) {
      await tx.bpRoleAssignment.update({
        where: { id: current.id },
        data: { isActive: false, deactivatedAt: new Date() },
      });
    }
  }
}

/** 付与されているロールの属性行だけを書く（外したロールの行は温存）。 */
async function syncRoleAttrs(tx: Tx, bpId: string, v: BpInput) {
  if (v.roles.includes("CUSTOMER") && v.customer) {
    const data = customerAttrsData(v.customer);
    await tx.bpCustomerAttrs.upsert({
      where: { bpId },
      create: { bpId, ...data },
      update: data,
    });
    // 営業担当は属性行ではなく bp_sales_reps（複数可）。
    await syncCustomerSalesReps(tx, bpId, v.customer.salesReps);
  }
  if (v.roles.includes("END_USER") && v.endUser) {
    const data = endUserAttrsData(v.endUser);
    await tx.bpEndUserAttrs.upsert({
      where: { bpId },
      create: { bpId, ...data },
      update: data,
    });
  }
  if (v.roles.includes("VENDOR") && v.vendor) {
    const data = vendorAttrsData(v.vendor);
    await tx.bpVendorAttrs.upsert({
      where: { bpId },
      create: { bpId, ...data },
      update: data,
    });
  }
}

export async function createBusinessPartner(
  input: BpInput,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = bpInput.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const bpCode = await nextSerialCode("BP");
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.businessPartner.create({
        data: { bpCode, ...bpBaseData(v) },
      });
      await syncRoles(tx, row.id, v.roles);
      await syncRoleAttrs(tx, row.id, v);
      return row;
    });
    await recordAudit({
      action: "CREATE",
      tableName: "business_partners",
      recordId: created.id,
      after: { nameJa: v.nameJa, roles: v.roles, isActive: v.isActive },
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.businessPartnerActions.createFailed"),
        tr,
      ),
    );
  }
}

export async function updateBusinessPartner(
  id: string,
  input: BpInput,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = bpInput.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const prior = await prisma.businessPartner.findUnique({
      where: { id },
      select: {
        name: true,
        isActive: true,
        roleAssignments: { where: { isActive: true }, select: { role: true } },
      },
    });
    if (!prior)
      return actionError(tr("master.businessPartnerActions.bpNotFound"));
    await prisma.$transaction(async (tx) => {
      await tx.businessPartner.update({ where: { id }, data: bpBaseData(v) });
      await syncRoles(tx, id, v.roles);
      await syncRoleAttrs(tx, id, v);
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "business_partners",
      recordId: id,
      before: {
        nameJa: (prior.name as { ja?: string } | null)?.ja ?? null,
        roles: prior.roleAssignments.map((r) => r.role),
        isActive: prior.isActive,
      },
      after: { nameJa: v.nameJa, roles: v.roles, isActive: v.isActive },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.businessPartnerActions.updateFailed"),
        tr,
      ),
    );
  }
}

/** 親コード内の次の支店コード（`BP-00001-01` 形式）。 */
async function nextBranchCode(parentId: string, parentCode: string) {
  const siblings = await prisma.businessPartner.findMany({
    where: { parentId },
    select: { bpCode: true },
  });
  const max = siblings.reduce((acc, s) => {
    const suffix = s.bpCode?.slice(parentCode.length + 1);
    const n = suffix ? Number.parseInt(suffix, 10) : Number.NaN;
    return Number.isNaN(n) ? acc : Math.max(acc, n);
  }, 0);
  return `${parentCode}-${String(max + 1).padStart(2, "0")}`;
}

export async function createBranch(
  parentId: string,
  input: BranchInput,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = branchInput.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const parent = await prisma.businessPartner.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.parentId) {
      return actionError(tr("master.businessPartnerActions.parentBpNotFound"));
    }
    const bpCode = parent.bpCode
      ? await nextBranchCode(parentId, parent.bpCode)
      : null;
    const contactName = v.contactName?.trim();
    const created = await prisma.businessPartner.create({
      data: {
        bpCode,
        parentId,
        ...bpBaseData(v),
        ...(contactName
          ? { contacts: { create: { name: contactName, isPrimary: true } } }
          : {}),
      },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "business_partners",
      recordId: created.id,
      after: { nameJa: v.nameJa, parentId, isActive: v.isActive },
    });
    revalidate(parentId, created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.businessPartnerActions.branchCreateFailed"),
        tr,
      ),
    );
  }
}

export async function updateBranch(
  parentId: string,
  branchId: string,
  input: BranchInput,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = branchInput.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const branch = await prisma.businessPartner.findUnique({
      where: { id: branchId },
    });
    if (!branch || branch.parentId !== parentId) {
      return actionError(tr("master.businessPartnerActions.branchNotFound"));
    }
    await prisma.businessPartner.update({
      where: { id: branchId },
      data: bpBaseData(v),
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "business_partners",
      recordId: branchId,
      before: {
        nameJa: (branch.name as { ja?: string } | null)?.ja ?? null,
        isActive: branch.isActive,
      },
      after: { nameJa: v.nameJa, isActive: v.isActive },
    });
    revalidate(parentId, branchId);
    return actionOk({ id: branchId });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.businessPartnerActions.branchUpdateFailed"),
        tr,
      ),
    );
  }
}

export async function deleteBranch(
  parentId: string,
  branchId: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("master", "DELETE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const branch = await prisma.businessPartner.findUnique({
      where: { id: branchId },
    });
    if (!branch || branch.parentId !== parentId) {
      return actionError(tr("master.businessPartnerActions.branchNotFound"));
    }
    const quotes = await prisma.quote.count({
      where: {
        OR: [{ customerBranchBpId: branchId }, { customerBpId: branchId }],
      },
    });
    if (quotes > 0) {
      return actionError(
        tr("master.businessPartnerActions.branchInUseByQuotes"),
      );
    }
    await prisma.$transaction([
      prisma.bpContact.deleteMany({ where: { bpId: branchId } }),
      prisma.bpRoleAssignment.deleteMany({ where: { bpId: branchId } }),
      prisma.businessPartner.delete({ where: { id: branchId } }),
    ]);
    await recordAudit({
      action: "DELETE",
      tableName: "business_partners",
      recordId: branchId,
      before: { nameJa: (branch.name as { ja?: string } | null)?.ja ?? null },
    });
    revalidate(parentId);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("master.businessPartnerActions.branchDeleteFailed"),
        tr,
      ),
    );
  }
}
