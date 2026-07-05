"use server";

/**
 * Server Actions — 最終需要家マスタ (MS02).
 *
 * END_USER ロール + bp_end_user_attrs（業種）。大口顧客のみ任意登録。
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
import { bpBaseData, bpBaseInput } from "../_shared/bp-schema";

const BASE_PATH = "/master/end-users";

const endUserInput = bpBaseInput.extend({
  industry: z.string().optional(),
});

export type EndUserInput = z.infer<typeof endUserInput>;

function revalidate(id?: string) {
  revalidatePath(BASE_PATH);
  if (id) revalidatePath(`${BASE_PATH}/${id}`);
}

export async function createEndUser(
  input: EndUserInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = endUserInput.safeParse(input);
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
        roleAssignments: { create: { role: "END_USER" } },
        endUserAttrs: { create: { industry: v.industry?.trim() || null } },
      },
    });
    revalidate(created.id);
    return actionOk({ id: created.id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "最終需要家の作成に失敗しました"));
  }
}

export async function updateEndUser(
  id: string,
  input: EndUserInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = endUserInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  try {
    const industry = v.industry?.trim() || null;
    await prisma.businessPartner.update({
      where: { id },
      data: {
        ...bpBaseData(v),
        endUserAttrs: {
          upsert: { create: { industry }, update: { industry } },
        },
      },
    });
    revalidate(id);
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "最終需要家の更新に失敗しました"));
  }
}
