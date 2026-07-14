"use server";

/**
 * Server Actions — 請求書 (app.invoices, BL01).
 *
 * 請求書の作成は締日処理 (closings/actions.ts processClosing) が担うため、
 * ここはステータス遷移のみ:
 *   DRAFT →(発行 issueInvoice)→ ISSUED →(送付 markSent)→ SENT
 *   →(入金 markPaid)→ PAID。
 * 遷移は status を where に含めた updateMany で原子的にガードする。
 * 弥生 CSV エクスポート（yayoiExportedAt の記録）は app/api/export/yayoi。
 */

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/billing/invoices";

function revalidate(number: string) {
  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${number}`);
}

/** 発行 (DRAFT → ISSUED + issuedAt=now)。 */
export async function issueInvoice(number: string): Promise<ActionResult> {
  const key = parseDocKey(number, "INV");
  if (!key) return actionError("請求番号が不正です");
  try {
    const updated = await prisma.invoice.updateMany({
      where: { ...key, status: "DRAFT" },
      data: { status: "ISSUED", issuedAt: new Date() },
    });
    if (updated.count === 0) {
      return actionError("下書きの請求書のみ発行できます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
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

/** 送付済み (ISSUED → SENT + sentAt=now)。 */
export async function markSent(number: string): Promise<ActionResult> {
  const key = parseDocKey(number, "INV");
  if (!key) return actionError("請求番号が不正です");
  try {
    const updated = await prisma.invoice.updateMany({
      where: { ...key, status: "ISSUED" },
      data: { status: "SENT", sentAt: new Date() },
    });
    if (updated.count === 0) {
      return actionError("発行済みの請求書のみ送付済みにできます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { status: "ISSUED" },
      after: { status: "SENT" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "送付処理に失敗しました"));
  }
}

/** 入金済み (SENT → PAID)。 */
export async function markPaid(number: string): Promise<ActionResult> {
  const key = parseDocKey(number, "INV");
  if (!key) return actionError("請求番号が不正です");
  try {
    const updated = await prisma.invoice.updateMany({
      where: { ...key, status: "SENT" },
      data: { status: "PAID" },
    });
    if (updated.count === 0) {
      return actionError("送付済みの請求書のみ入金済みにできます");
    }
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: number,
      before: { status: "SENT" },
      after: { status: "PAID" },
    });
    revalidate(number);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, "入金処理に失敗しました"));
  }
}
