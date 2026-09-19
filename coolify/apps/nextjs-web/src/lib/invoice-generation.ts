/**
 * invoice-generation.ts — 出荷から請求書（DRAFT）を組み立てる唯一の場所。server-only.
 *
 * 締日処理（BL02, SCHEDULED — PENDING の締日行から）と手動請求（BL11,
 * MANUAL — 選んだ納品書/出荷書から）の両方が**同じ明細組み立て・税計算**を
 * 通る。別々に書くと、締め済みかどうかで請求額の数え方が変わり得る
 * （§9 更新: 締日処理は「締め → 下書きまで 1 回」、手動請求は締日を待たない
 * 臨時請求）。
 *
 * 締日行（billing_closings）の状態遷移だけが 2 経路で異なる:
 *   SCHEDULED — 既存の PENDING 行を PROCESSED へ進める（runClosingBatch /
 *               processClosing が起点）。
 *   MANUAL    — 行そのものを PROCESSED で新規作成する（PENDING で待つ理由が
 *               無い — 締日を待たず、選んだ出荷がその場で確定する）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  type BillableShipment,
  billableUnitPrice,
  fetchBillableShipmentsForClosing,
  resolveBillingPeriodStart,
} from "@/app/(dashboard)/billing/closings/data";
import { closingDateReached } from "@/components/billing/closings/model";
import { isoDateJst } from "@/components/sales/price-lists/model";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import {
  resolveBillingPartyId,
  resolveDueDate,
} from "@/lib/billing-terms-core";
import { customerFacingProductLabel } from "@/lib/customer-product-code-core";
import {
  type CustomerProductLabel,
  fetchCustomerProductLabels,
} from "@/lib/customer-product-codes";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { label } from "@/lib/messages";
import { lineAmountYen, type TaxBucket, totalsByRateYen } from "@/lib/money";
import { allocateDocumentKey } from "@/lib/numbering";
import { resolveSalesRepId } from "@/lib/sales-rep";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { loadTaxCatalog } from "@/lib/tax-categories";
import { billingBasisDate, resolveLineTax } from "@/lib/tax-rate";

/** DATE / タイムスタンプ → JST 暦日 "YYYY-MM-DD"。null はそのまま。 */
function isoDateOrNull(value: Date | null | undefined): string | null {
  return value == null ? null : isoDateJst(value);
}

/** 旧 enum に写せる区分コードか（tax_categories は独自コードも持てる）。 */
function asLegacyTaxType(
  code: string | null,
): "TAXABLE" | "EXEMPT" | "REDUCED" | null {
  return code === "TAXABLE" || code === "EXEMPT" || code === "REDUCED"
    ? code
    : null;
}

/** その率の束に属する明細の課税区分が 1 つに定まるならその id、でなければ null。 */
export function bucketCategoryId(
  items: readonly { taxRate: number; taxCategoryId: number | null }[],
  taxRate: number,
): number | null {
  const ids = new Set(
    items
      .filter((it) => it.taxRate.toFixed(4) === taxRate.toFixed(4))
      .map((it) => it.taxCategoryId),
  );
  if (ids.size !== 1) return null;
  return ids.values().next().value ?? null;
}

/**
 * ヘッダに焼く課税区分・税率。**単一税率のときだけ**埋める（design 参照:
 * 混在請求書は 1 率しか持てないヘッダでは表せないので null にし、内訳は
 * invoice_tax_summaries だけに持たせる）。
 */
export function headerTaxSnapshot(
  items: readonly { taxRate: number; taxCategoryId: number | null }[],
  buckets: readonly TaxBucket[],
  catalog: { categories: readonly { id: number; code: string }[] },
): {
  taxType: "TAXABLE" | "EXEMPT" | "REDUCED" | null;
  taxRate: number | null;
} {
  if (buckets.length !== 1) return { taxType: null, taxRate: null };
  const rate = buckets[0].taxRate;
  const categoryId = bucketCategoryId(items, rate);
  const code =
    categoryId == null
      ? null
      : (catalog.categories.find((c) => c.id === categoryId)?.code ?? null);
  return { taxType: asLegacyTaxType(code), taxRate: rate };
}

/** 請求明細 1 行（製品 / 追加料金で同じ形）。 */
interface InvoiceItemDraft {
  deliveryOrderYearMonth: string | null;
  deliveryOrderSeq: number | null;
  deliveryNoteYearMonth: string | null;
  deliveryNoteSeq: number | null;
  orderLineId: string | null;
  chargeItemId: number | null;
  description: { ja: string; en: string };
  quantity: number;
  unitPrice: number;
  amount: number;
  taxCategoryId: number | null;
  taxRate: number;
  sortOrder: number;
}

/** customerAttrs のうち、この組み立てが読む部分。 */
export interface ClosingCustomerAttrsRef {
  taxCategoryId: number | null;
  paymentTermsDays: number | null;
  paymentDay: number | null;
  billingBpId: string | null;
}

/**
 * 出荷 → 請求明細への組み立て（税計算・小計・合計込み）。**丸め・税率決定の
 * 唯一の定義元** — SCHEDULED / MANUAL のどちらも必ずこれを通る。
 */
async function buildInvoiceDraft(
  closingDate: Date,
  customerAttrs: ClosingCustomerAttrsRef | null,
  shipments: BillableShipment[],
): Promise<{
  items: InvoiceItemDraft[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  buckets: TaxBucket[];
  taxType: "TAXABLE" | "EXEMPT" | "REDUCED" | null;
  taxRate: number | null;
}> {
  const catalog = await loadTaxCatalog();
  // 取引先の課税区分。**null =「製品に従う」** で、入っていれば製品より優先する。
  const customerTaxCategoryId = customerAttrs?.taxCategoryId ?? null;

  const customerBpId = shipments[0]?.customerBpId;
  const customerLabels = customerBpId
    ? await fetchCustomerProductLabels(
        customerBpId,
        // **品目 id を渡す**（品目統合 第 2 段 C）。旧 products.id を渡しても
        // 型は通るが、どちらも int の連番なので**別の製品の品番が当たり得る**。
        shipments.flatMap((s) =>
          s.items
            .map((it) => it.itemId)
            .filter((id): id is number => id != null),
        ),
      )
    : new Map<number, CustomerProductLabel>();

  let sortOrder = 0;
  const items: InvoiceItemDraft[] = shipments.flatMap((s) => {
    const deliveryNote = s.deliveryNotes[0] ?? null;
    return s.items.map((it) => {
      const unitPrice = billableUnitPrice(it);
      const name = it.item?.name as LocalizedText | null;
      const customerLabel =
        it.itemId != null ? customerLabels.get(it.itemId) : undefined;
      const withCode = (locale: string) =>
        customerFacingProductLabel(localized(name, locale), customerLabel);
      const ja =
        it.lotNumber != null
          ? label("billing.closingActions.itemNameWithLot", "ja", "", {
              name: withCode("ja"),
              lot: it.lotNumber,
            })
          : withCode("ja");
      const en =
        it.lotNumber != null
          ? label("billing.closingActions.itemNameWithLot", "en", "", {
              name: withCode("en"),
              lot: it.lotNumber,
            })
          : withCode("en");
      const lineTax = resolveLineTax(catalog, {
        customerTaxCategoryId,
        productTaxCategoryId: it.item?.taxCategoryId ?? null,
        basisDate: billingBasisDate(
          isoDateOrNull(it.orderLine?.acceptance?.orderDate),
          isoDateOrNull(s.shippedAt),
          isoDateJst(closingDate),
        ),
      });
      return {
        deliveryOrderYearMonth: s.yearMonth,
        deliveryOrderSeq: s.seq,
        deliveryNoteYearMonth: deliveryNote?.yearMonth ?? null,
        deliveryNoteSeq: deliveryNote?.seq ?? null,
        orderLineId: it.orderLineId,
        chargeItemId: null,
        description: { ja, en },
        quantity: it.quantity,
        unitPrice,
        amount: lineAmountYen(unitPrice, it.quantity),
        taxCategoryId: lineTax.categoryId,
        taxRate: lineTax.rate,
        sortOrder: sortOrder++,
      } satisfies InvoiceItemDraft;
    });
  });

  // 追加料金（送料など）— 出荷書の行をそのまま請求明細にする。基準日は出荷日。
  const chargeItems: InvoiceItemDraft[] = shipments.flatMap((s) => {
    const deliveryNote = s.deliveryNotes[0] ?? null;
    return s.charges.map((c) => {
      const name = c.chargeItem.name as LocalizedText | null;
      const suffix = c.description ? `（${c.description}）` : "";
      const lineTax = resolveLineTax(catalog, {
        customerTaxCategoryId,
        productTaxCategoryId: c.chargeItem.taxCategoryId,
        basisDate: billingBasisDate(
          null,
          isoDateOrNull(s.shippedAt),
          isoDateJst(closingDate),
        ),
      });
      return {
        deliveryOrderYearMonth: s.yearMonth,
        deliveryOrderSeq: s.seq,
        deliveryNoteYearMonth: deliveryNote?.yearMonth ?? null,
        deliveryNoteSeq: deliveryNote?.seq ?? null,
        orderLineId: null,
        chargeItemId: null,
        description: {
          ja: `${localized(name, "ja")}${suffix}`,
          en: `${localized(name, "en")}${suffix}`,
        },
        quantity: c.quantity,
        unitPrice: Number(c.unitPrice),
        amount: Number(c.amount),
        taxCategoryId: lineTax.categoryId,
        taxRate: lineTax.rate,
        sortOrder: sortOrder++,
      } satisfies InvoiceItemDraft;
    });
  });
  items.push(...chargeItems);

  const { subtotal, taxAmount, totalAmount, buckets } = totalsByRateYen(
    items.map((it) => ({ amount: it.amount, taxRate: it.taxRate })),
  );
  const { taxType, taxRate } = headerTaxSnapshot(items, buckets, catalog);

  return { items, subtotal, taxAmount, totalAmount, buckets, taxType, taxRate };
}

export interface GeneratedInvoice {
  invoiceNumber: string;
}

/**
 * SCHEDULED — PENDING の締日行から請求書を生成する。既存の PENDING 行を
 * PROCESSED へ進める（processClosing / runClosingBatch の共通コア）。
 */
export async function generateInvoiceForClosing(
  closingId: string,
): Promise<ActionResult<GeneratedInvoice>> {
  const tr = await getTranslations();
  const BASE_PATH = "/billing/closings";
  const INVOICES_PATH = "/billing/invoices";

  try {
    const closing = await prisma.billingClosing.findUnique({
      where: { id: closingId },
      include: { customerBp: { include: { customerAttrs: true } } },
    });
    if (!closing)
      return actionError(tr("billing.closingActions.closingNotFound"));
    if (closing.status !== "PENDING") {
      return actionError(tr("billing.closingActions.pendingOnly"));
    }
    if (!closingDateReached(closing.closingDate, isoDateJst(new Date()))) {
      return actionError(tr("billing.closingActions.closingDateNotReached"));
    }

    const shipments = await fetchBillableShipmentsForClosing(
      closing.customerBpId,
      closing.closingDate,
    );
    if (shipments.length === 0) {
      return actionError(tr("billing.closings.thereAreNoShipmentsToBill"));
    }

    const draft = await buildInvoiceDraft(
      closing.closingDate,
      closing.customerBp.customerAttrs,
      shipments,
    );

    const closingDate = closing.closingDate;
    const periodFrom = await resolveBillingPeriodStart(
      closing.customerBpId,
      closingDate,
    );
    const dueDate = resolveDueDate(closingDate, {
      paymentTermsDays: closing.customerBp.customerAttrs?.paymentTermsDays,
      paymentDay: closing.customerBp.customerAttrs?.paymentDay,
    });
    const billingPartyId = resolveBillingPartyId(
      closing.customerBpId,
      closing.customerBp.customerAttrs?.billingBpId,
    );
    const branchIds = new Set(shipments.map((s) => s.customerBranchBpId ?? ""));
    const customerBranchBpId =
      branchIds.size === 1 ? branchIds.values().next().value || null : null;
    const repIds = new Set(
      shipments.flatMap((s) =>
        s.items.map((it) => it.orderLine?.acceptance.salesRepId ?? ""),
      ),
    );
    const inheritedSalesRepId =
      repIds.size === 1 ? repIds.values().next().value || null : null;
    const salesRepId = await resolveSalesRepId(
      inheritedSalesRepId,
      closing.customerBpId,
      null,
    );

    const actorId = await getCurrentActorId();
    const { yearMonth, seq } = await allocateDocumentKey("INVOICE");
    const invoiceNumber = formatDocNumber("INV", { yearMonth, seq });

    await prisma.$transaction(async (tx) => {
      await tx.invoice.create({
        data: {
          yearMonth,
          seq,
          customerBpId: billingPartyId,
          customerBranchBpId:
            billingPartyId === closing.customerBpId ? customerBranchBpId : null,
          salesRepId,
          closingKind: "SCHEDULED",
          billingPeriodFrom: periodFrom,
          billingPeriodTo: closingDate,
          subtotal: draft.subtotal,
          taxAmount: draft.taxAmount,
          totalAmount: draft.totalAmount,
          taxType: draft.taxType,
          taxRate: draft.taxRate,
          status: "DRAFT",
          dueDate,
          createdBy: actorId,
          items: { create: draft.items },
          taxSummaries: {
            create: draft.buckets.map((b, i) => ({
              taxCategoryId: bucketCategoryId(draft.items, b.taxRate),
              taxRate: b.taxRate,
              taxableBase: b.taxableBase,
              taxAmount: b.taxAmount,
              sortOrder: i,
            })),
          },
        },
      });
      const updated = await tx.billingClosing.updateMany({
        where: { id: closingId, status: "PENDING" },
        data: {
          status: "PROCESSED",
          totalAmount: draft.subtotal,
          invoiceYearMonth: yearMonth,
          invoiceSeq: seq,
          processedAt: new Date(),
          processedBy: actorId,
        },
      });
      if (updated.count === 0) {
        throw new Error(`GUARD:${tr("billing.closingActions.pendingOnly")}`);
      }
    });

    await recordAudit({
      action: "CREATE",
      tableName: "invoices",
      recordId: invoiceNumber,
      after: {
        customerBpId: billingPartyId,
        orderingCustomerBpId: closing.customerBpId,
        billingPeriodFrom: periodFrom.toISOString(),
        billingPeriodTo: closingDate.toISOString(),
        subtotal: draft.subtotal,
        taxAmount: draft.taxAmount,
        totalAmount: draft.totalAmount,
        taxType: draft.taxType,
        taxRate: draft.taxRate,
        taxBuckets: draft.buckets,
        status: "DRAFT",
        dueDate: dueDate.toISOString(),
        itemCount: draft.items.length,
        closingId,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "billing_closings",
      recordId: closingId,
      before: { status: "PENDING" },
      after: { status: "PROCESSED", invoiceNumber },
    });

    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${closingId}`);
    revalidatePath(INVOICES_PATH);
    revalidatePath(`${INVOICES_PATH}/${invoiceNumber}`);
    return actionOk({ invoiceNumber });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("GUARD:")) {
      return actionError(e.message.slice("GUARD:".length));
    }
    return actionError(
      prismaErrorMessage(
        e,
        tr("billing.closingActions.generateInvoiceFailed"),
        tr,
      ),
    );
  }
}

/**
 * MANUAL — 選んだ出荷から締日行（PROCESSED で新規作成）+ 請求書を同時に作る。
 * PENDING で待つ理由が無い（締日を待たず、選んだ出荷がその場で確定する）ので
 * SCHEDULED と違い、行の作成と PROCESSED 化を 1 回の $transaction にまとめる。
 */
export async function generateManualInvoice(input: {
  customerBpId: string;
  shipments: BillableShipment[];
  customerAttrs: ClosingCustomerAttrsRef | null;
}): Promise<ActionResult<GeneratedInvoice & { closingId: string }>> {
  const tr = await getTranslations();
  const BASE_PATH = "/billing/closings";
  const INVOICES_PATH = "/billing/invoices";

  try {
    if (input.shipments.length === 0) {
      return actionError(tr("billing.closings.thereAreNoShipmentsToBill"));
    }
    const closingDate = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    );

    const draft = await buildInvoiceDraft(
      closingDate,
      input.customerAttrs,
      input.shipments,
    );

    const periodFrom = await resolveBillingPeriodStart(
      input.customerBpId,
      closingDate,
    );
    const dueDate = resolveDueDate(closingDate, {
      paymentTermsDays: input.customerAttrs?.paymentTermsDays,
      paymentDay: input.customerAttrs?.paymentDay,
    });
    const billingPartyId = resolveBillingPartyId(
      input.customerBpId,
      input.customerAttrs?.billingBpId,
    );
    const branchIds = new Set(
      input.shipments.map((s) => s.customerBranchBpId ?? ""),
    );
    const customerBranchBpId =
      branchIds.size === 1 ? branchIds.values().next().value || null : null;
    const repIds = new Set(
      input.shipments.flatMap((s) =>
        s.items.map((it) => it.orderLine?.acceptance.salesRepId ?? ""),
      ),
    );
    const inheritedSalesRepId =
      repIds.size === 1 ? repIds.values().next().value || null : null;
    const salesRepId = await resolveSalesRepId(
      inheritedSalesRepId,
      input.customerBpId,
      null,
    );

    const actorId = await getCurrentActorId();
    const { yearMonth, seq } = await allocateDocumentKey("INVOICE");
    const invoiceNumber = formatDocNumber("INV", { yearMonth, seq });

    const closingId = await prisma.$transaction(async (tx) => {
      const closing = await tx.billingClosing.create({
        data: {
          customerBpId: input.customerBpId,
          closingDate,
          kind: "MANUAL",
          status: "PROCESSED",
          totalAmount: draft.subtotal,
          invoiceYearMonth: yearMonth,
          invoiceSeq: seq,
          processedAt: new Date(),
          processedBy: actorId,
        },
      });
      await tx.invoice.create({
        data: {
          yearMonth,
          seq,
          customerBpId: billingPartyId,
          customerBranchBpId:
            billingPartyId === input.customerBpId ? customerBranchBpId : null,
          salesRepId,
          closingKind: "MANUAL",
          billingPeriodFrom: periodFrom,
          billingPeriodTo: closingDate,
          subtotal: draft.subtotal,
          taxAmount: draft.taxAmount,
          totalAmount: draft.totalAmount,
          taxType: draft.taxType,
          taxRate: draft.taxRate,
          status: "DRAFT",
          dueDate,
          createdBy: actorId,
          items: { create: draft.items },
          taxSummaries: {
            create: draft.buckets.map((b, i) => ({
              taxCategoryId: bucketCategoryId(draft.items, b.taxRate),
              taxRate: b.taxRate,
              taxableBase: b.taxableBase,
              taxAmount: b.taxAmount,
              sortOrder: i,
            })),
          },
        },
      });
      return closing.id;
    });

    await recordAudit({
      action: "CREATE",
      tableName: "invoices",
      recordId: invoiceNumber,
      after: {
        customerBpId: billingPartyId,
        orderingCustomerBpId: input.customerBpId,
        billingPeriodFrom: periodFrom.toISOString(),
        billingPeriodTo: closingDate.toISOString(),
        subtotal: draft.subtotal,
        taxAmount: draft.taxAmount,
        totalAmount: draft.totalAmount,
        itemCount: draft.items.length,
        closingId,
        closingKind: "MANUAL",
      },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "billing_closings",
      recordId: closingId,
      after: {
        customerBpId: input.customerBpId,
        closingDate: closingDate.toISOString().slice(0, 10),
        kind: "MANUAL",
        status: "PROCESSED",
        invoiceNumber,
      },
    });

    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${closingId}`);
    revalidatePath(INVOICES_PATH);
    revalidatePath(`${INVOICES_PATH}/${invoiceNumber}`);
    return actionOk({ invoiceNumber, closingId });
  } catch (e) {
    return actionError(
      prismaErrorMessage(
        e,
        tr("billing.closingActions.generateInvoiceFailed"),
        tr,
      ),
    );
  }
}
