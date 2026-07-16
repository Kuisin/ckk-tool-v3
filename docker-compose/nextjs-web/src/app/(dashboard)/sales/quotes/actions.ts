"use server";

/**
 * Server Actions — 見積書 (sales.quotes + quote_items).
 *
 * Quotes are keyed (year_month, seq); QOT-YYYYMM-NNNNN is derived. 見積書は
 * 価格表からのみ価格を解決する — 明細の単価・値引きは保存時にもサーバー側で
 * 価格表から再解決してスナップショットする（クライアント表示値は信用しない）。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveUnitPriceFromEntries } from "@/components/sales/quotes/model";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatQuoteNumber, parseDocKey } from "@/lib/doc-number";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { fetchEntriesForCustomer } from "./data";

const BASE_PATH = "/sales/quotes";

const itemInput = z.object({
  productId: z.string().min(1, "製品を選択してください"),
  orderType: z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]),
  quantity: z.number().int().min(1, "数量は1以上"),
  deliveryDate: z.string().nullable(),
  notes: z.string().nullable(),
});

const quoteInput = z.object({
  customerBpId: z.string().min(1, "顧客を選択してください"),
  customerBranchBpId: z.string().nullable(),
  status: z.enum(["DRAFT", "ISSUED", "ACCEPTED", "REJECTED", "EXPIRED"]),
  validUntil: z.string().nullable(),
  notes: z.string(),
  items: z.array(itemInput).min(1, "明細を1件以上追加してください"),
});

export type QuoteInput = z.infer<typeof quoteInput>;

function revalidate(number?: string) {
  revalidatePath(BASE_PATH);
  if (number) {
    revalidatePath(`${BASE_PATH}/${number}`);
    revalidatePath(`${BASE_PATH}/${number}/edit`);
  }
}

/**
 * 明細の単価・値引きを価格表からサーバー側で再解決する。
 * 未解決の行（価格表なし）はエラー — 見積書は価格表からのみ作成できる。
 */
async function resolveItems(v: QuoteInput) {
  const entries = await fetchEntriesForCustomer(v.customerBpId);
  const resolved = v.items.map((it, i) => {
    const r = resolveUnitPriceFromEntries(
      entries,
      v.customerBpId,
      it.productId,
      it.orderType,
      it.quantity,
    );
    if (!r) {
      throw new Error(
        `明細${i + 1}: 該当する価格表がありません（試算から価格表を登録してください）`,
      );
    }
    return {
      productId: Number(it.productId),
      orderType: it.orderType,
      quantity: it.quantity,
      unitPrice: r.unitPrice,
      priceListTierId: r.tierId,
      discountAmount: r.discountAmount,
      discountLabel: r.discountLabel,
      amount: Math.max(0, r.unitPrice * it.quantity - r.discountAmount),
      deliveryDate: it.deliveryDate ? new Date(it.deliveryDate) : null,
      notes: it.notes,
      sortOrder: i,
    };
  });
  return resolved;
}

export async function createQuote(
  payload: QuoteInput,
): Promise<ActionResult<{ number: string }>> {
  const parsed = quoteInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const authz = await checkPermission("quote", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const items = await resolveItems(v);
    const { yearMonth, seq } = await allocateDocumentKey("QUOTE");
    await prisma.quote.create({
      data: {
        yearMonth,
        seq,
        customerBpId: v.customerBpId,
        customerBranchBpId: v.customerBranchBpId,
        status: v.status,
        validUntil: v.validUntil ? new Date(v.validUntil) : null,
        notes: v.notes.trim() || null,
        items: { create: items },
      },
    });
    const number = formatQuoteNumber({ yearMonth, seq });
    await recordAudit({
      action: "CREATE",
      tableName: "quotes",
      recordId: number,
      after: {
        customerBpId: v.customerBpId,
        status: v.status,
        validUntil: v.validUntil,
        notes: v.notes.trim() || null,
        itemCount: v.items.length,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("明細")) {
      return actionError(e.message);
    }
    return actionError(prismaErrorMessage(e, "見積書の作成に失敗しました"));
  }
}

export async function updateQuote(
  number: string,
  payload: QuoteInput,
): Promise<ActionResult<{ number: string }>> {
  const key = parseDocKey(number, "QOT");
  if (!key) return actionError("見積番号が不正です");
  const parsed = quoteInput.safeParse(payload);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  const authz = await checkPermission("quote", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const items = await resolveItems(v);
    const prior = await prisma.quote.findUnique({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
      select: {
        customerBpId: true,
        status: true,
        validUntil: true,
        notes: true,
      },
    });
    await prisma.$transaction([
      prisma.quoteItem.deleteMany({
        where: { quoteYearMonth: key.yearMonth, quoteSeq: key.seq },
      }),
      prisma.quote.update({
        where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
        data: {
          customerBpId: v.customerBpId,
          customerBranchBpId: v.customerBranchBpId,
          status: v.status,
          validUntil: v.validUntil ? new Date(v.validUntil) : null,
          notes: v.notes.trim() || null,
          items: { create: items },
        },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "quotes",
      recordId: number,
      before: prior
        ? {
            customerBpId: prior.customerBpId,
            status: prior.status,
            validUntil: prior.validUntil
              ? prior.validUntil.toISOString().slice(0, 10)
              : null,
            notes: prior.notes,
          }
        : undefined,
      after: {
        customerBpId: v.customerBpId,
        status: v.status,
        validUntil: v.validUntil,
        notes: v.notes.trim() || null,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("明細")) {
      return actionError(e.message);
    }
    return actionError(prismaErrorMessage(e, "見積書の更新に失敗しました"));
  }
}

/** 発行 (DRAFT → ISSUED)。PDF 生成は /api/pdf/quote（呼び出し側）が担う。 */
export async function issueQuote(
  number: string,
  validUntil: string | null,
): Promise<ActionResult> {
  const key = parseDocKey(number, "QOT");
  if (!key) return actionError("見積番号が不正です");
  const authz = await checkPermission("quote", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const updated = await prisma.quote.updateMany({
      where: { yearMonth: key.yearMonth, seq: key.seq, status: "DRAFT" },
      data: {
        status: "ISSUED",
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    });
    if (updated.count === 0) {
      return actionError("下書きの見積書のみ発行できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "quotes",
      recordId: number,
      before: { status: "DRAFT" },
      after: { status: "ISSUED", validUntil },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "発行に失敗しました"));
  }
}
