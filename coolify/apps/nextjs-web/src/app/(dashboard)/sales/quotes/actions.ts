"use server";

/**
 * Server Actions — 見積書 (sales.quotes + quote_items).
 *
 * Quotes are keyed (year_month, seq); QOT-YYYYMM-NNNNN is derived. 見積書は
 * 価格表からのみ価格を解決する — 明細の単価・値引きは保存時にもサーバー側で
 * 価格表から再解決してスナップショットする（クライアント表示値は信用しない）。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { resolveUnitPriceFromEntries } from "@/components/sales/quotes/model";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatQuoteNumber, parseDocKey } from "@/lib/doc-number";
import { allocateDocumentKey } from "@/lib/numbering";
import { resolveSalesRepId } from "@/lib/sales-rep";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { fetchEntriesForCustomer } from "./data";

const BASE_PATH = "/sales/quotes";

/**
 * 明細解決（価格表なし）のエラーを識別するためのマーカー。メッセージは
 * 翻訳されるため、判定は `instanceof` で行う（文字列の前方一致には頼らない）。
 */
class LineItemResolveError extends Error {}

/**
 * 対象見積書がスコープ内か（OWN 行チェック）。ALL は素通し。
 * 不存在は true — 既存の not-found 系エラー処理に委ねる。
 */
async function quoteInScope(
  access: Access,
  userId: string,
  key: { yearMonth: string; seq: number },
): Promise<boolean> {
  if (access.kind === "ALL") return true;
  const row = await prisma.quote.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    select: { createdBy: true },
  });
  if (!row) return true;
  return rowInScope(access, { createdBy: row.createdBy }, userId);
}

function itemInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    productId: z.string().min(1, tr("common.selectAProduct")),
    orderType: z.enum(["PRODUCTION", "TEST", "SAMPLE", "OTHER"]),
    quantity: z.number().int().min(1, tr("sales.quoteActions.quantityMinOne")),
    deliveryDate: z.string().nullable(),
    notes: z.string().nullable(),
  });
}

function quoteInputSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    customerBpId: z
      .string()
      .min(1, tr("sales.orderAcceptances.selectACustomer")),
    customerBranchBpId: z.string().nullable(),
    // 営業担当 — 顧客の担当一覧（bp_sales_reps）から選ぶ。未指定で顧客が
    // 変わったときは主担当が既定で入る（lib/sales-rep resolveSalesRepId）。
    salesRepId: z.string().nullable().optional(),
    status: z.enum(["DRAFT", "ISSUED", "ACCEPTED", "REJECTED", "EXPIRED"]),
    validUntil: z.string().nullable(),
    notes: z.string(),
    items: z
      .array(itemInputSchema(tr))
      .min(1, tr("common.addAtLeastOneLineItem")),
  });
}

export type QuoteInput = z.infer<ReturnType<typeof quoteInputSchema>>;

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
async function resolveItems(
  v: QuoteInput,
  tr: Awaited<ReturnType<typeof getTranslations>>,
) {
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
      throw new LineItemResolveError(
        tr("sales.quoteActions.noPriceListEntry", { line: i + 1 }),
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
  const tr = await getTranslations();
  const parsed = quoteInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const authz = await checkPermission("quote", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const v = parsed.data;
  try {
    const items = await resolveItems(v, tr);
    const { yearMonth, seq } = await allocateDocumentKey("QUOTE");
    // 新規は prior 顧客が無いので、未指定なら顧客の主担当が入る。
    const salesRepId = await resolveSalesRepId(
      v.salesRepId,
      v.customerBpId,
      null,
    );
    await prisma.quote.create({
      data: {
        yearMonth,
        seq,
        customerBpId: v.customerBpId,
        customerBranchBpId: v.customerBranchBpId,
        salesRepId,
        status: v.status,
        validUntil: v.validUntil ? new Date(v.validUntil) : null,
        notes: v.notes.trim() || null,
        createdBy: authz.userId,
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
        salesRepId,
        status: v.status,
        validUntil: v.validUntil,
        notes: v.notes.trim() || null,
        itemCount: v.items.length,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    if (e instanceof LineItemResolveError) {
      return actionError(e.message);
    }
    return actionError(
      prismaErrorMessage(e, tr("sales.quoteActions.createFailed"), tr),
    );
  }
}

export async function updateQuote(
  number: string,
  payload: QuoteInput,
): Promise<ActionResult<{ number: string }>> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "QOT");
  if (!key) return actionError(tr("sales.quoteActions.invalidQuoteNumber"));
  const parsed = quoteInputSchema(tr).safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const authz = await checkPermission("quote", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await quoteInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.quoteActions.scopeDenied"));
  }
  const v = parsed.data;
  try {
    const items = await resolveItems(v, tr);
    const prior = await prisma.quote.findUnique({
      where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
      select: {
        customerBpId: true,
        salesRepId: true,
        status: true,
        validUntil: true,
        notes: true,
      },
    });
    const salesRepId = await resolveSalesRepId(
      v.salesRepId,
      v.customerBpId,
      prior?.customerBpId ?? null,
    );
    await prisma.$transaction([
      prisma.quoteItem.deleteMany({
        where: { quoteYearMonth: key.yearMonth, quoteSeq: key.seq },
      }),
      prisma.quote.update({
        where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
        data: {
          customerBpId: v.customerBpId,
          customerBranchBpId: v.customerBranchBpId,
          salesRepId,
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
            salesRepId: prior.salesRepId,
            status: prior.status,
            validUntil: prior.validUntil
              ? prior.validUntil.toISOString().slice(0, 10)
              : null,
            notes: prior.notes,
          }
        : undefined,
      after: {
        customerBpId: v.customerBpId,
        salesRepId,
        status: v.status,
        validUntil: v.validUntil,
        notes: v.notes.trim() || null,
      },
    });
    revalidate(number);
    return actionOk({ number });
  } catch (e) {
    if (e instanceof LineItemResolveError) {
      return actionError(e.message);
    }
    return actionError(
      prismaErrorMessage(e, tr("sales.quoteActions.updateFailed"), tr),
    );
  }
}

/** 発行 (DRAFT → ISSUED)。PDF 生成は /api/pdf/quote（呼び出し側）が担う。 */
export async function issueQuote(
  number: string,
  validUntil: string | null,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const key = parseDocKey(number, "QOT");
  if (!key) return actionError(tr("sales.quoteActions.invalidQuoteNumber"));
  const authz = await checkPermission("quote", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  if (!(await quoteInScope(authz.access, authz.userId, key))) {
    return actionError(tr("sales.quoteActions.scopeDenied"));
  }
  try {
    const updated = await prisma.quote.updateMany({
      where: { yearMonth: key.yearMonth, seq: key.seq, status: "DRAFT" },
      data: {
        status: "ISSUED",
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    });
    if (updated.count === 0) {
      return actionError(tr("sales.quoteActions.onlyDraftCanBeIssued"));
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
    return actionError(
      prismaErrorMessage(e, tr("sales.quoteActions.issueFailed"), tr),
    );
  }
}
