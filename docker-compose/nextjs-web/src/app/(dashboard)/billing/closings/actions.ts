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
import {
  addDays,
  monthStart,
  parseYearMonth,
} from "@/components/billing/closings/model";
import { getCurrentActorId, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { allocateDocumentKey } from "@/lib/numbering";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import {
  collectClosingCandidates,
  fetchBillableShipmentsForClosing,
  shipmentAmount,
} from "./data";

const BASE_PATH = "/billing/closings";
const INVOICES_PATH = "/billing/invoices";

/** 消費税率（標準 10%）。税額 = round(小計 × 税率)。 */
const TAX_RATE = 0.1;
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
  const ym = parseYearMonth(yearMonth);
  if (!ym) return actionError("対象月の形式が不正です（YYYYMM）");
  try {
    const candidates = await collectClosingCandidates(ym.year, ym.month);
    if (candidates.length === 0) {
      return actionError("対象月に未請求の出荷がありません");
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const c of candidates) {
      const existing = await prisma.billingClosing.findUnique({
        where: {
          customerBpId_closingDate: {
            customerBpId: c.customerBpId,
            closingDate: c.closingDate,
          },
        },
      });
      if (existing && existing.status !== "PENDING") {
        // 既に請求書を生成済み — 上書きしない。
        skipped += 1;
        continue;
      }
      if (existing) {
        await prisma.billingClosing.update({
          where: { id: existing.id },
          data: { totalAmount: c.totalAmount },
        });
        await recordAudit({
          action: "UPDATE",
          tableName: "billing_closings",
          recordId: existing.id,
          before: {
            totalAmount:
              existing.totalAmount != null
                ? Number(existing.totalAmount)
                : null,
          },
          after: {
            totalAmount: c.totalAmount,
            shipmentNumbers: c.shipmentNumbers,
          },
        });
        updated += 1;
      } else {
        const row = await prisma.billingClosing.create({
          data: {
            customerBpId: c.customerBpId,
            closingDate: c.closingDate,
            status: "PENDING",
            totalAmount: c.totalAmount,
          },
        });
        await recordAudit({
          action: "CREATE",
          tableName: "billing_closings",
          recordId: row.id,
          after: {
            customerBpId: c.customerBpId,
            customerName: c.customerName,
            closingDate: c.closingDate.toISOString(),
            status: "PENDING",
            totalAmount: c.totalAmount,
            shipmentNumbers: c.shipmentNumbers,
          },
        });
        created += 1;
      }
    }

    revalidatePath(BASE_PATH);
    return actionOk({ created, updated, skipped });
  } catch (e) {
    return actionError(prismaErrorMessage(e, "締日処理の実行に失敗しました"));
  }
}

/**
 * 請求書を生成 (PENDING → PROCESSED)。生成した請求書番号を返す —
 * クライアントは請求書詳細へ遷移する。
 */
export async function processClosing(
  id: string,
): Promise<ActionResult<{ invoiceNumber: string }>> {
  try {
    const closing = await prisma.billingClosing.findUnique({
      where: { id },
      include: {
        customerBp: { include: { customerAttrs: true } },
      },
    });
    if (!closing) return actionError("対象の締日処理が見つかりません");
    if (closing.status !== "PENDING") {
      return actionError("未処理の締日のみ請求書を生成できます");
    }

    const shipments = await fetchBillableShipmentsForClosing(
      closing.customerBpId,
      closing.closingDate,
    );
    if (shipments.length === 0) {
      return actionError("請求対象の出荷がありません");
    }

    // 明細: 出荷書明細 1 行 = 請求明細 1 行（摘要 = 製品名 + ロット、由来キー付き）。
    let sortOrder = 0;
    const items = shipments.flatMap((s) => {
      const unitPrice = Number(s.salesOrder.unitPrice);
      const deliveryNote = s.deliveryNotes[0] ?? null;
      return s.items.map((it) => {
        const name = it.product.name as LocalizedText | null;
        const ja =
          it.lotNumber != null
            ? `${localized(name, "ja")}（ロット ${it.lotNumber}）`
            : localized(name, "ja");
        const en =
          it.lotNumber != null
            ? `${localized(name, "en")} (Lot ${it.lotNumber})`
            : localized(name, "en");
        return {
          shippingOrderYearMonth: s.yearMonth,
          shippingOrderSeq: s.seq,
          deliveryNoteYearMonth: deliveryNote?.yearMonth ?? null,
          deliveryNoteSeq: deliveryNote?.seq ?? null,
          description: { ja, en },
          quantity: it.quantity,
          unitPrice,
          amount: it.quantity * unitPrice,
          sortOrder: sortOrder++,
        };
      });
    });

    const subtotal = shipments.reduce((sum, s) => sum + shipmentAmount(s), 0);
    const taxAmount = Math.round(subtotal * TAX_RATE);
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
    // 支店: 対象出荷の注文請書に共通の支店があれば引き継ぐ。
    const branchIds = new Set(
      shipments.map((s) => s.salesOrder.customerBranchBpId ?? ""),
    );
    const customerBranchBpId =
      branchIds.size === 1 ? branchIds.values().next().value || null : null;

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
        throw new Error("GUARD:未処理の締日のみ請求書を生成できます");
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
    return actionError(prismaErrorMessage(e, "請求書の生成に失敗しました"));
  }
}
