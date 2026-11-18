"use server";

/**
 * Server Actions — 手動請求 (BL11)。締日を待たず、選んだ出荷から臨時の
 * 請求書（下書き）を起こす。billing_closings には kind=MANUAL の行が
 * 1 本残る（実際の生成は lib/invoice-generation.ts generateManualInvoice —
 * 締日処理と同じ明細組み立て・税計算を通る）。
 */

import { getTranslations } from "next-intl/server";
import { fetchUninvoicedShipmentsForCustomer } from "@/app/(dashboard)/billing/closings/data";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { generateManualInvoice } from "@/lib/invoice-generation";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";
import { fetchUnbilledShipmentRows, type UnbilledShipmentRow } from "./data";

/** 客を選んだあとに呼ぶ — その顧客の未請求出荷を返す。 */
export async function searchUnbilledShipments(
  customerBpId: string,
): Promise<ActionResult<UnbilledShipmentRow[]>> {
  const authz = await checkPermission("invoice", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const rows = await fetchUnbilledShipmentRows(customerBpId);
  return actionOk(rows);
}

/**
 * 選んだ出荷から請求書（下書き）を作る。**再取得して検証する** — 画面が
 * 開いている間に他の請求書処理が同じ出荷を先に取り込んでいたら、古い選択の
 * まま作らせない（二重請求の穴を塞ぐ最後の砦）。
 */
export async function createManualInvoice(input: {
  customerBpId: string;
  deliveryOrderKeys: { yearMonth: string; seq: number }[];
}): Promise<ActionResult<{ invoiceNumber: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("invoice", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  if (input.deliveryOrderKeys.length === 0) {
    return actionError(tr("common.noTargetSelected"));
  }

  const uninvoiced = await fetchUninvoicedShipmentsForCustomer(
    input.customerBpId,
  );
  const wanted = new Set(
    input.deliveryOrderKeys.map((k) => `${k.yearMonth}-${k.seq}`),
  );
  const shipments = uninvoiced.filter((s) =>
    wanted.has(`${s.yearMonth}-${s.seq}`),
  );
  if (shipments.length !== input.deliveryOrderKeys.length) {
    return actionError(tr("billing.invoices.someShipmentsNoLongerAvailable"));
  }

  const customerAttrs = await prisma.bpCustomerAttrs.findUnique({
    where: { bpId: input.customerBpId },
    select: {
      taxCategoryId: true,
      paymentTermsDays: true,
      paymentDay: true,
      billingBpId: true,
    },
  });

  const result = await generateManualInvoice({
    customerBpId: input.customerBpId,
    shipments,
    customerAttrs: customerAttrs ?? null,
  });
  if (!result.ok) return actionError(result.error);
  return actionOk({ invoiceNumber: result.data.invoiceNumber });
}
