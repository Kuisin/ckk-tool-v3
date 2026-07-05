"use server";

/**
 * Server Actions — 外注企業マスタ (MS06).
 *
 * VENDOR ロール + bp_vendor_attrs（仕入先/外注先種別・支払条件・振込先・
 * 標準リードタイム）。
 */

import { revalidatePath } from "next/cache";
import type { z } from "zod";
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
  vendorAttrsData,
  vendorAttrsInput,
} from "../_shared/bp-schema";

const BASE_PATH = "/master/suppliers";

const supplierInput = bpBaseInput.extend({
  attrs: vendorAttrsInput,
});

export type SupplierInput = z.infer<typeof supplierInput>;

function revalidate(id?: string) {
  revalidatePath(BASE_PATH);
  if (id) revalidatePath(`${BASE_PATH}/${id}`);
}

export async function createSupplier(
  input: SupplierInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierInput.safeParse(input);
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
        roleAssignments: { create: { role: "VENDOR" } },
        vendorAttrs: { create: vendorAttrsData(v.attrs) },
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "外注企業の作成に失敗しました"));
  }
}

export async function updateSupplier(
  id: string,
  input: SupplierInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const attrs = vendorAttrsData(v.attrs);
    await prisma.businessPartner.update({
      where: { id },
      data: {
        ...bpBaseData(v),
        vendorAttrs: {
          upsert: { create: attrs, update: attrs },
        },
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "外注企業の更新に失敗しました"));
  }
}
