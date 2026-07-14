"use server";

/**
 * Server Actions — 納品書 (app.delivery_notes, SH02).
 *
 * 作成は allocateDocumentKey("DELIVERY") で (yearMonth, seq) を1回採番し、
 * 明細を nested create で一括作成する。表示番号 DRN-YYYYMM-NNNNN は導出。
 * 納品先（recipient）は出荷書 → 注文請書の顧客（+支店）から自動確定する。
 * DIRECT_TO_USER（ユーザー直送）は最終需要家が必須。価格記載
 * （includePrice=false）のときは単価・金額を保存しない（null）。
 *
 * ステータス遷移: DRAFT →(発行)→ ISSUED →(納品)→ DELIVERED。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatDocNumber, parseDocKey } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/shipping/delivery-notes";

const itemInput = z.object({
  productId: z.string().min(1, "製品を選択してください"),
  quantity: z.number().int().min(1, "数量は1以上"),
  unitPrice: z.number().min(0).nullable(),
  notes: z.string().nullable(),
});

const baseInput = z.object({
  deliveryMethod: z.enum(["NORMAL", "DIRECT_TO_USER"]),
  endUserBpId: z.string().nullable(),
  includePrice: z.boolean(),
  notes: z.string().nullable(),
  items: z.array(itemInput).min(1, "明細を1件以上追加してください"),
});

const createInput = baseInput.extend({
  shippingOrderNumber: z.string().min(1, "出荷書を選択してください"),
});

export type DeliveryNoteCreateInput = z.infer<typeof createInput>;
export type DeliveryNoteUpdateInput = z.infer<typeof baseInput>;

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) {
    revalidatePath(`${BASE_PATH}/${number}`);
    revalidatePath(`${BASE_PATH}/${number}/edit`);
  }
}

const trimOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

/** 明細行 → DB 値。価格記載なしのときは単価・金額を保存しない。 */
function toItemData(
  it: z.infer<typeof itemInput>,
  i: number,
  includePrice: boolean,
) {
  const unitPrice = includePrice ? (it.unitPrice ?? 0) : null;
  return {
    productId: Number(it.productId),
    quantity: it.quantity,
    unitPrice,
    // 金額はサーバー側で計算（クライアント表示値は信用しない）。
    amount: unitPrice != null ? unitPrice * it.quantity : null,
    notes: trimOrNull(it.notes),
    sortOrder: i,
  };
}

/** 最終需要家（END_USER ロールの有効 BP）検索 — ユーザー直送の届け先 Select。 */
export async function searchEndUserOptions(
  query: string,
): Promise<{ value: string; label: string }[]> {
  const q = query.trim();
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      roleAssignments: { some: { role: "END_USER" } },
      ...(q
        ? {
            OR: [
              { bpCode: { contains: q, mode: "insensitive" } },
              { name: { path: ["ja"], string_contains: q } },
              { matchNames: { has: q } },
            ],
          }
        : {}),
    },
    orderBy: { bpCode: "asc" },
    take: 20,
  });
  return rows.map((r) => ({
    value: r.id,
    label: localized(r.name as LocalizedText | null),
  }));
}

/** 作成 — 採番1回 + ヘッダ・明細を一括作成。作成後は詳細ページへ。 */
export async function createDeliveryNote(
  payload: DeliveryNoteCreateInput,
): Promise<ActionResult<{ number: string }>> {
  const parsed = createInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  const shpKey = parseDocKey(v.shippingOrderNumber, "SHP");
  if (!shpKey) return actionError("出荷書番号が不正です");
  if (v.deliveryMethod === "DIRECT_TO_USER" && !v.endUserBpId) {
    return actionError("ユーザー直送では最終需要家を選択してください");
  }
  try {
    // 納品先は出荷書 → 注文請書の顧客（+支店）から確定する。
    const shp = await prisma.shippingOrder.findUnique({
      where: { yearMonth_seq: shpKey },
      include: { salesOrder: true },
    });
    if (!shp) return actionError("対象の出荷書が見つかりません");
    if (shp.status !== "CONFIRMED" && shp.status !== "SHIPPED") {
      return actionError("確定済み・出荷済みの出荷書のみ納品書を作成できます");
    }

    const { yearMonth, seq } = await allocateDocumentKey("DELIVERY");
    await prisma.deliveryNote.create({
      data: {
        yearMonth,
        seq,
        shippingOrderYearMonth: shpKey.yearMonth,
        shippingOrderSeq: shpKey.seq,
        deliveryMethod: v.deliveryMethod,
        recipientBpId: shp.salesOrder.customerBpId,
        recipientBranchBpId: shp.salesOrder.customerBranchBpId,
        endUserBpId:
          v.deliveryMethod === "DIRECT_TO_USER" ? v.endUserBpId : null,
        includePrice: v.includePrice,
        notes: trimOrNull(v.notes),
        items: {
          create: v.items.map((it, i) => toItemData(it, i, v.includePrice)),
        },
      },
    });
    const number = formatDocNumber("DRN", { yearMonth, seq });
    await recordAudit({
      action: "CREATE",
      tableName: "delivery_notes",
      recordId: number,
      after: {
        shippingOrderNumber: v.shippingOrderNumber,
        deliveryMethod: v.deliveryMethod,
        recipientBpId: shp.salesOrder.customerBpId,
        endUserBpId:
          v.deliveryMethod === "DIRECT_TO_USER" ? v.endUserBpId : null,
        includePrice: v.includePrice,
        status: "DRAFT",
        notes: trimOrNull(v.notes),
        items: v.items,
      },
    });
    revalidate(number);
    revalidatePath(`/shipping/shipping-orders/${v.shippingOrderNumber}`);
    return actionOk({ number });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "納品書の作成に失敗しました"));
  }
}

/** 更新 — 下書きのみ（明細は全置換）。出荷書・納品先は作成後変更不可。 */
export async function updateDeliveryNote(
  number: string,
  payload: DeliveryNoteUpdateInput,
): Promise<ActionResult<{ number: string }>> {
  const key = parseDocKey(number, "DRN");
  if (!key) return actionError("納品番号が不正です");
  const parsed = baseInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const v = parsed.data;
  if (v.deliveryMethod === "DIRECT_TO_USER" && !v.endUserBpId) {
    return actionError("ユーザー直送では最終需要家を選択してください");
  }
  try {
    const prior = await prisma.deliveryNote.findUnique({
      where: { yearMonth_seq: key },
      select: {
        deliveryMethod: true,
        endUserBpId: true,
        includePrice: true,
        notes: true,
        items: {
          orderBy: { sortOrder: "asc" },
          select: { productId: true, quantity: true, notes: true },
        },
      },
    });
    await prisma.$transaction(async (tx) => {
      // status を where に含めた updateMany で原子的にガードする。
      const updated = await tx.deliveryNote.updateMany({
        where: { ...key, status: "DRAFT" },
        data: {
          deliveryMethod: v.deliveryMethod,
          endUserBpId:
            v.deliveryMethod === "DIRECT_TO_USER" ? v.endUserBpId : null,
          includePrice: v.includePrice,
          notes: trimOrNull(v.notes),
        },
      });
      if (updated.count === 0) {
        throw new Error("GUARD:下書きの納品書のみ編集できます");
      }
      // 明細は全置換（DRAFT のみのため参照はまだ無い）。
      await tx.deliveryNoteItem.deleteMany({
        where: {
          deliveryNoteYearMonth: key.yearMonth,
          deliveryNoteSeq: key.seq,
        },
      });
      await tx.deliveryNoteItem.createMany({
        data: v.items.map((it, i) => ({
          deliveryNoteYearMonth: key.yearMonth,
          deliveryNoteSeq: key.seq,
          ...toItemData(it, i, v.includePrice),
        })),
      });
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_notes",
      recordId: number,
      before: prior ?? undefined,
      after: {
        deliveryMethod: v.deliveryMethod,
        endUserBpId:
          v.deliveryMethod === "DIRECT_TO_USER" ? v.endUserBpId : null,
        includePrice: v.includePrice,
        notes: trimOrNull(v.notes),
        items: v.items,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    return actionError(prismaErrorMessage(e, "納品書の更新に失敗しました"));
  }
}

/** 発行 (DRAFT → ISSUED)。 */
export async function issueDeliveryNote(number: string): Promise<ActionResult> {
  const key = parseDocKey(number, "DRN");
  if (!key) return actionError("納品番号が不正です");
  try {
    const updated = await prisma.deliveryNote.updateMany({
      where: { ...key, status: "DRAFT" },
      data: { status: "ISSUED" },
    });
    if (updated.count === 0) {
      return actionError("下書きの納品書のみ発行できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_notes",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "ISSUED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "発行に失敗しました"));
  }
}

/** 納品済み (ISSUED → DELIVERED + deliveredAt=now)。 */
export async function markDelivered(number: string): Promise<ActionResult> {
  const key = parseDocKey(number, "DRN");
  if (!key) return actionError("納品番号が不正です");
  try {
    const updated = await prisma.deliveryNote.updateMany({
      where: { ...key, status: "ISSUED" },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });
    if (updated.count === 0) {
      return actionError("発行済みの納品書のみ納品済みにできます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "delivery_notes",
      recordId: number,
      before: { status: "ISSUED" },
      after: { status: "DELIVERED" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "納品処理に失敗しました"));
  }
}
