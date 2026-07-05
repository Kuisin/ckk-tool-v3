"use server";

/**
 * Server Actions — 顧客マスタ (MS01) + 支店。
 *
 * BP コードは BP-NNNNN の全体通し採番（lib/numbering.ts）。支店は
 * `親コード-NN`（親内連番）で、bp.business_partners の parent_id 子行として
 * 保持する。CUSTOMER ロール割当と bp_customer_attrs を同時に管理する。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { nextSerialCode } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  bpBaseData,
  bpBaseInput,
  customerAttrsData,
  customerAttrsInput,
} from "../_shared/bp-schema";

const BASE_PATH = "/master/customers";

const customerInput = bpBaseInput.extend({
  attrs: customerAttrsInput,
});

export type CustomerInput = z.infer<typeof customerInput>;

const branchInput = bpBaseInput.extend({
  contactName: z.string().optional(),
});

export type BranchInput = z.infer<typeof branchInput>;

function revalidate(id?: string, branchId?: string) {
  revalidatePath(BASE_PATH);
  if (id) revalidatePath(`${BASE_PATH}/${id}`);
  if (id && branchId) {
    revalidatePath(`${BASE_PATH}/${id}/branches/${branchId}`);
  }
}

export async function createCustomer(
  input: CustomerInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = customerInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const bpCode = await nextSerialCode("BP");
    const created = await prisma.businessPartner.create({
      data: {
        bpCode,
        ...bpBaseData(v),
        roleAssignments: { create: { role: "CUSTOMER" } },
        customerAttrs: { create: customerAttrsData(v.attrs) },
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "顧客の作成に失敗しました"));
  }
}

export async function updateCustomer(
  id: string,
  input: CustomerInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = customerInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const attrs = customerAttrsData(v.attrs);
    await prisma.businessPartner.update({
      where: { id },
      data: {
        ...bpBaseData(v),
        customerAttrs: {
          upsert: { create: attrs, update: attrs },
        },
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "顧客の更新に失敗しました"));
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
  const parsed = branchInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const parent = await prisma.businessPartner.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.parentId) {
      return actionError("親の顧客が見つかりません");
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
    revalidate(parentId, created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "支店の作成に失敗しました"));
  }
}

export async function updateBranch(
  parentId: string,
  branchId: string,
  input: BranchInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = branchInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const branch = await prisma.businessPartner.findUnique({
      where: { id: branchId },
    });
    if (!branch || branch.parentId !== parentId) {
      return actionError("対象の支店が見つかりません");
    }
    await prisma.businessPartner.update({
      where: { id: branchId },
      data: bpBaseData(v),
    });
    revalidate(parentId, branchId);
    return actionOk({ id: branchId });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "支店の更新に失敗しました"));
  }
}

export async function deleteBranch(
  parentId: string,
  branchId: string,
): Promise<ActionResult> {
  try {
    const branch = await prisma.businessPartner.findUnique({
      where: { id: branchId },
    });
    if (!branch || branch.parentId !== parentId) {
      return actionError("対象の支店が見つかりません");
    }
    const quotes = await prisma.quote.count({
      where: {
        OR: [{ customerBranchBpId: branchId }, { customerBpId: branchId }],
      },
    });
    if (quotes > 0) {
      return actionError(
        "この支店を参照する見積書が存在するため削除できません。無効化を検討してください。",
      );
    }
    await prisma.$transaction([
      prisma.bpContact.deleteMany({ where: { bpId: branchId } }),
      prisma.bpRoleAssignment.deleteMany({ where: { bpId: branchId } }),
      prisma.businessPartner.delete({ where: { id: branchId } }),
    ]);
    revalidate(parentId);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "支店の削除に失敗しました"));
  }
}
