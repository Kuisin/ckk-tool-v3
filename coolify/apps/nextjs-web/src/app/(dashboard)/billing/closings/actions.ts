"use server";

/**
 * Server Actions — 締日処理 (app.billing_closings, BL02).
 *
 * runClosing(yearMonth): 対象月の未請求出荷（SHIPPED × DISPATCH）を顧客ごとに
 * 集計し、締日（BpCustomerAttrs.closingDay、既定 = 月末）で PENDING の
 * billing_closings 行を作成/更新する。既に処理済み（PROCESSED/EXPORTED）の
 * 行はスキップ。
 *
 * processClosing(id): PENDING の締日行から請求書を生成する —
 * allocateDocumentKey("INVOICE") で採番し、対象出荷の明細を invoice_items
 * （由来 = 出荷書/納品書キー）として一括作成。小計 Σ、消費税 = 小計×10%
 * （四捨五入）、支払期限 = 締日 + 支払サイト（既定 30 日）。$transaction で
 * 請求書作成と締日行の PROCESSED 化（+請求書リンク）を原子的に行う。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  addDays,
  monthStart,
  parseYearMonth,
} from "@/components/billing/closings/model";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { label } from "@/lib/messages";
import { allocateDocumentKey } from "@/lib/numbering";
import { resolveSalesRepId } from "@/lib/sales-rep";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { fetchBillableShipmentsForClosing, shipmentAmount } from "./data";

const BASE_PATH = "/billing/closings";
const INVOICES_PATH = "/billing/invoices";

/**
 * 消費税率 — 顧客属性 tax_type から導出（監査 P0-5: 10% 固定を廃止）。
 * TAXABLE=10% / REDUCED=8% / EXEMPT=0%。税額 = round(小計 × 税率)。
 */
const TAX_RATES: Record<string, number> = {
  TAXABLE: 0.1,
  REDUCED: 0.08,
  EXEMPT: 0,
};
function taxRateFor(taxType: string | null | undefined): number {
  return TAX_RATES[taxType ?? "TAXABLE"] ?? 0.1;
}
/** 支払サイト既定値（日）— BpCustomerAttrs.paymentTermsDays 未設定時。 */
const DEFAULT_PAYMENT_TERMS_DAYS = 30;

export interface RunClosingResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * 締日処理を実行 — 対象月 "YYYYMM" の未請求出荷を顧客×締日で集計する。
 * 戻り値は作成/更新/スキップ（処理済み行）件数。
 */
export async function runClosing(
  yearMonth: string,
): Promise<ActionResult<RunClosingResult>> {
  const tr = await getTranslations();
  const ym = parseYearMonth(yearMonth);
  if (!ym) return actionError(tr("billing.closingActions.invalidYearMonth"));
  const authz = await checkPermission("billing_closing", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    // バッチコアは lib/closing.ts（日次オートランと共通 — 監査 P2-4）
    const { runClosingBatch } = await import("@/lib/closing");
    const result = await runClosingBatch(ym.year, ym.month);
    if (result.created + result.updated + result.skipped === 0) {
      return actionError(
        tr("billing.closingActions.noUnbilledShipmentsForMonth"),
      );
    }
    revalidatePath(BASE_PATH);
    return actionOk(result);
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("billing.closingActions.runFailed"), tr),
    );
  }
}

/**
 * 請求書を生成 (PENDING → PROCESSED)。生成した請求書番号を返す —
 * クライアントは請求書詳細へ遷移する。
 */
export async function processClosing(
  id: string,
): Promise<ActionResult<{ invoiceNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("billing_closing", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const closing = await prisma.billingClosing.findUnique({
      where: { id },
      include: {
        customerBp: { include: { customerAttrs: true } },
      },
    });
    if (!closing)
      return actionError(tr("billing.closingActions.closingNotFound"));
    if (closing.status !== "PENDING") {
      return actionError(tr("billing.closingActions.pendingOnly"));
    }

    const shipments = await fetchBillableShipmentsForClosing(
      closing.customerBpId,
      closing.closingDate,
    );
    if (shipments.length === 0) {
      return actionError(tr("billing.closings.thereAreNoShipmentsToBill"));
    }

    // 明細: 出荷書明細 1 行 = 請求明細 1 行（摘要 = 製品名 + ロット、由来キー付き）。
    let sortOrder = 0;
    const items = shipments.flatMap((s) => {
      const deliveryNote = s.deliveryNotes[0] ?? null;
      return s.items.map((it) => {
        // 単価は**その行の**注文明細から取る（1 出荷書に単価の異なる
        // 複数明細が載り得るため、出荷書単位の単一単価では誤請求になる）。
        const unitPrice = Number(it.orderLine?.unitPrice ?? 0);
        const name = it.product.name as LocalizedText | null;
        const ja =
          it.lotNumber != null
            ? label("billing.closingActions.itemNameWithLot", "ja", "", {
                name: localized(name, "ja"),
                lot: it.lotNumber,
              })
            : localized(name, "ja");
        const en =
          it.lotNumber != null
            ? label("billing.closingActions.itemNameWithLot", "en", "", {
                name: localized(name, "en"),
                lot: it.lotNumber,
              })
            : localized(name, "en");
        return {
          deliveryOrderYearMonth: s.yearMonth,
          deliveryOrderSeq: s.seq,
          deliveryNoteYearMonth: deliveryNote?.yearMonth ?? null,
          deliveryNoteSeq: deliveryNote?.seq ?? null,
          // 注文明細 → 請求のトレーサビリティ（単価の出所）
          orderLineId: it.orderLineId,
          description: { ja, en },
          quantity: it.quantity,
          unitPrice,
          amount: it.quantity * unitPrice,
          sortOrder: sortOrder++,
        };
      });
    });

    const subtotal = shipments.reduce((sum, s) => sum + shipmentAmount(s), 0);
    const taxRate = taxRateFor(closing.customerBp.customerAttrs?.taxType);
    const taxAmount = Math.round(subtotal * taxRate);
    const totalAmount = subtotal + taxAmount;

    const closingDate = closing.closingDate;
    const paymentTermsDays =
      closing.customerBp.customerAttrs?.paymentTermsDays ??
      DEFAULT_PAYMENT_TERMS_DAYS;
    // 請求期間 = 月初〜締日（簡易; 前締日ベースの厳密期間は将来対応）。
    const periodFrom = monthStart(
      closingDate.getUTCFullYear(),
      closingDate.getUTCMonth() + 1,
    );
    const dueDate = addDays(closingDate, paymentTermsDays);
    // 支店: 対象出荷に共通の支店があれば引き継ぐ。
    const branchIds = new Set(shipments.map((s) => s.customerBranchBpId ?? ""));
    const customerBranchBpId =
      branchIds.size === 1 ? branchIds.values().next().value || null : null;
    // 営業担当も同じ考え方 — 対象出荷の担当（明細の注文請書ヘッダから導出）が
    // 1 人に定まればそれを引き継ぎ、ばらけていれば顧客の主担当を入れる
    // （請求書に編集フォームは無いので、ここで決めた値がそのまま残る）。
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
          customerBpId: closing.customerBpId,
          customerBranchBpId,
          salesRepId,
          billingPeriodFrom: periodFrom,
          billingPeriodTo: closingDate,
          subtotal,
          taxAmount,
          totalAmount,
          status: "DRAFT",
          dueDate,
          createdBy: actorId,
          items: { create: items },
        },
      });
      // status を where に含めた updateMany で二重処理を原子的にガードする。
      const updated = await tx.billingClosing.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "PROCESSED",
          totalAmount: subtotal,
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
        customerBpId: closing.customerBpId,
        billingPeriodFrom: periodFrom.toISOString(),
        billingPeriodTo: closingDate.toISOString(),
        subtotal,
        taxAmount,
        totalAmount,
        status: "DRAFT",
        dueDate: dueDate.toISOString(),
        itemCount: items.length,
        closingId: id,
      },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "billing_closings",
      recordId: id,
      before: { status: "PENDING" },
      after: { status: "PROCESSED", invoiceNumber },
    });

    revalidatePath(BASE_PATH);
    revalidatePath(`${BASE_PATH}/${id}`);
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
