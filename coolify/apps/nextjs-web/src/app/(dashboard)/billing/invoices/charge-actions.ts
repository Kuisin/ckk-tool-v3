"use server";

/**
 * charge-actions.ts — 下書きへの追加費用（§9. 料金マスタ MS0G からだけ選べる）。
 *
 * `ChargesPanel`（指示書・出荷書と共用の部品）の `onSave` は「手動費用の
 * 全行を入れ替える」形（delete-then-create）。同じ形をここでも使い、
 * 保存のたびに**明細全体**（出荷書由来 + 手動費用）から小計・税額・合計を
 * 引き直す — lib/invoice-generation.ts と同じ丸め方（totalsByRateYen）を
 * 通すので、締日処理が作った請求書と 1 円もずれない。
 *
 * **費用を足した / 消した時点で承認状態を NONE に戻す** — 承認後に金額を
 * 変えたものが承認済みのまま発行されるのを防ぐ（§9）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { isoDateJst } from "@/components/sales/price-lists/model";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import {
  type ChargeItemRef,
  chargeInputError,
  resolveChargeLine,
} from "@/lib/charge-core";
import { type ChargeRowsInput, chargeRowsSchema } from "@/lib/charges";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { bucketCategoryId, headerTaxSnapshot } from "@/lib/invoice-generation";
import { totalsByRateYen } from "@/lib/money";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { loadTaxCatalog } from "@/lib/tax-categories";
import { billingBasisDate, resolveLineTax } from "@/lib/tax-rate";

const BASE_PATH = "/billing/invoices";

function revalidate(number: string) {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${number}`);
}

/**
 * 下書きの請求書へ、手動費用の全行を入れ替えて保存する。
 * `rows` は ChargesPanel が渡す**その時点の全行**（追加も削除も、この
 * 1 回の呼び出しに含まれる）。出荷書由来の明細には触れない。
 */
export async function saveInvoiceCharges(
  number: string,
  rows: ChargeRowsInput,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("invoice", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const key = parseDocKey(number, "INV");
  if (!key) return actionError(tr("billing.invoicesActions.invalidNumber"));
  const parsed = chargeRowsSchema.safeParse(rows);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { yearMonth_seq: key },
      include: { customerBp: { include: { customerAttrs: true } } },
    });
    if (!invoice) {
      return actionError(tr("billing.invoicesActions.invalidNumber"));
    }
    // **下書きのうちだけ**編集できる — 発行後は締日処理・手動請求と同じ
    // 「金額を凍結したら根拠も凍結する」規約を守る。
    if (invoice.status !== "DRAFT") {
      return actionError(tr("billing.invoices.chargesClosedForEditing"));
    }

    const chargeItemIds = [...new Set(parsed.data.map((r) => r.chargeItemId))];
    const chargeItems =
      chargeItemIds.length > 0
        ? await prisma.chargeItem.findMany({
            where: { id: { in: chargeItemIds } },
            select: {
              id: true,
              name: true,
              amountMode: true,
              defaultAmount: true,
              taxCategoryId: true,
            },
          })
        : [];
    const byId = new Map(chargeItems.map((c) => [c.id, c]));

    const catalog = await loadTaxCatalog();
    const customerTaxCategoryId =
      invoice.customerBp.customerAttrs?.taxCategoryId ?? null;
    const basisDate = billingBasisDate(
      null,
      null,
      isoDateJst(invoice.billingPeriodTo),
    );

    // 由来（出荷書側）の明細 + 手動費用の既存行（差し替え対象・削除前に数える）。
    // 「NOT 手動費用」= 出荷書の由来があるか chargeItemId が無い（De Morgan）。
    const [originItems, existingManualItems] = await Promise.all([
      prisma.invoiceItem.findMany({
        where: {
          invoiceYearMonth: key.yearMonth,
          invoiceSeq: key.seq,
          OR: [
            { deliveryOrderYearMonth: { not: null } },
            { chargeItemId: null },
          ],
        },
        select: {
          amount: true,
          taxRate: true,
          taxCategoryId: true,
          sortOrder: true,
        },
      }),
      prisma.invoiceItem.count({
        where: {
          invoiceYearMonth: key.yearMonth,
          invoiceSeq: key.seq,
          deliveryOrderYearMonth: null,
          chargeItemId: { not: null },
        },
      }),
    ]);

    let sortOrder = 1 + Math.max(-1, ...originItems.map((it) => it.sortOrder));

    type ManualDraft = {
      chargeItemId: number;
      description: { ja: string; en: string };
      quantity: number;
      unitPrice: number;
      amount: number;
      taxCategoryId: number | null;
      taxRate: number;
      sortOrder: number;
    };
    const manualDrafts: ManualDraft[] = [];
    for (const row of parsed.data) {
      const item = byId.get(row.chargeItemId);
      const ref: ChargeItemRef | undefined = item
        ? {
            id: item.id,
            amountMode: item.amountMode,
            defaultAmount:
              item.defaultAmount != null ? Number(item.defaultAmount) : null,
          }
        : undefined;
      const error = chargeInputError(row, ref);
      if (error) return actionError(tr(error));
      const resolved = resolveChargeLine(row, ref as ChargeItemRef);
      const name = item?.name as LocalizedText | null;
      const suffix = row.description ? `（${row.description}）` : "";
      const lineTax = resolveLineTax(catalog, {
        customerTaxCategoryId,
        productTaxCategoryId: item?.taxCategoryId ?? null,
        basisDate,
      });
      manualDrafts.push({
        chargeItemId: resolved.chargeItemId,
        description: {
          ja: `${localized(name, "ja")}${suffix}`,
          en: `${localized(name, "en")}${suffix}`,
        },
        quantity: resolved.quantity,
        unitPrice: resolved.unitPrice,
        amount: resolved.amount,
        taxCategoryId: lineTax.categoryId,
        taxRate: lineTax.rate,
        sortOrder: sortOrder++,
      });
    }

    // 明細全体（出荷書由来 + 手動費用）で小計・税額・合計を引き直す —
    // lib/invoice-generation.ts と同じ丸め方なので、締日処理と 1 円もずれない。
    const allForTotals = [
      ...originItems.map((it) => ({
        amount: Number(it.amount),
        taxRate: it.taxRate != null ? Number(it.taxRate) : 0,
        taxCategoryId: it.taxCategoryId,
      })),
      ...manualDrafts,
    ];
    const { subtotal, taxAmount, totalAmount, buckets } = totalsByRateYen(
      allForTotals.map((it) => ({ amount: it.amount, taxRate: it.taxRate })),
    );
    const { taxType, taxRate } = headerTaxSnapshot(
      allForTotals,
      buckets,
      catalog,
    );

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({
        where: {
          invoiceYearMonth: key.yearMonth,
          invoiceSeq: key.seq,
          deliveryOrderYearMonth: null,
          chargeItemId: { not: null },
        },
      });
      if (manualDrafts.length > 0) {
        await tx.invoiceItem.createMany({
          data: manualDrafts.map((d) => ({
            invoiceYearMonth: key.yearMonth,
            invoiceSeq: key.seq,
            chargeItemId: d.chargeItemId,
            description: d.description,
            quantity: d.quantity,
            unitPrice: d.unitPrice,
            amount: d.amount,
            taxCategoryId: d.taxCategoryId,
            taxRate: d.taxRate,
            sortOrder: d.sortOrder,
          })),
        });
      }
      await tx.invoiceTaxSummary.deleteMany({
        where: { invoiceYearMonth: key.yearMonth, invoiceSeq: key.seq },
      });
      await tx.invoiceTaxSummary.createMany({
        data: buckets.map((b, i) => ({
          invoiceYearMonth: key.yearMonth,
          invoiceSeq: key.seq,
          taxCategoryId: bucketCategoryId(allForTotals, b.taxRate),
          taxRate: b.taxRate,
          taxableBase: b.taxableBase,
          taxAmount: b.taxAmount,
          sortOrder: i,
        })),
      });
      await tx.invoice.update({
        where: { yearMonth_seq: key },
        data: {
          subtotal,
          taxAmount,
          totalAmount,
          taxType,
          taxRate,
          // 費用を足した/消した時点で承認をやり直させる — 承認後に金額を
          // 変えたものが承認済みのまま発行されないようにする。
          approvalStatus: "NONE",
          requestedAt: null,
          requestedBy: null,
          approvedAt: null,
          approvedBy: null,
          rejectedAt: null,
          rejectedBy: null,
          rejectReason: null,
        },
      });
    });

    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { manualChargeCount: existingManualItems },
      after: {
        manualChargeCount: manualDrafts.length,
        subtotal,
        taxAmount,
        totalAmount,
      },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("billing.invoices.chargesSaveFailed"), tr),
    );
  }
}
