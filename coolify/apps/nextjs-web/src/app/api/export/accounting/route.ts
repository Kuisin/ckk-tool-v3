/**
 * GET /api/export/accounting?invoice=<INV-…> — 会計連携（仕訳 CSV）エクスポート.
 *
 * 請求書 1 件 → 仕訳 CSV（lib/accounting-export-core.ts）を attachment で返す。
 * 仕訳日付は発行日。**下書き（DRAFT）は出さない**（金額が確定していない仕訳を
 * 会計へ渡さない — 409）。エクスポート成功時に invoices.accounting_exported_at を
 * 刻み、audit_logs へ EXPORT 相当の UPDATE を記録する（recordId = INV 番号）。
 * **既にエクスポート済みなら `force=1` を付けない限り 409**（二重取込の防止 — §9）。
 *
 * 列の並び・文字コード・既定の科目コードは SY0J 会計連携（/settings/accounting）
 * が持つ。旧 /api/export/yayoi は next.config.ts のリダイレクトでここへ来る。
 */

import {
  fetchInvoice,
  fetchInvoiceAccountingParty,
} from "@/app/(dashboard)/billing/invoices/data";
import { resolveTaxBuckets } from "@/components/billing/invoices/model";
import { encodeAccountingCsv } from "@/lib/accounting-encode";
import {
  buildAccountingCsvText,
  conflictingTaxRates,
} from "@/lib/accounting-export-core";
import {
  getAccountingSettings,
  getAccountingSettingsRevision,
} from "@/lib/accounting-settings";
import { recordAudit } from "@/lib/audit";
import { requirePermissionResponse } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";

// Reads request query params → always rendered at request time.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requirePermissionResponse("billing_closing", "EXPORT");
  if (denied) return denied;
  const url = new URL(request.url);
  const id = url.searchParams.get("invoice");
  if (!id) {
    return new Response('Missing "invoice" query parameter', { status: 400 });
  }

  const key = parseDocKey(id, "INV");
  const invoice = key ? await fetchInvoice(key) : null;
  if (!key || !invoice) {
    return new Response(`Invoice not found: ${id}`, { status: 404 });
  }

  if (invoice.status === "DRAFT" || !invoice.issuedAt) {
    return new Response(`Invoice ${id} is a draft; issue it before export`, {
      status: 409,
    });
  }
  if (invoice.accountingExportedAt && url.searchParams.get("force") !== "1") {
    return new Response(
      `Invoice ${id} was already exported at ${invoice.accountingExportedAt}; add force=1 to export again`,
      { status: 409 },
    );
  }

  const settings = await getAccountingSettings();
  const party = await fetchInvoiceAccountingParty(invoice.customerBpId);
  const input = {
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    customerCode: party.customerCode,
    receivableAccountCode: party.receivableAccountCode,
    receivableSubAccountCode: party.receivableSubAccountCode,
    slipNo: key.seq,
    // 仕訳日付 = 発行日（下書きは上で弾いている）。
    date: invoice.issuedAt,
    totalAmount: invoice.totalAmount,
    taxAmount: invoice.taxAmount,
    // 税率ごとの内訳（区分記載）。画面・PDF と同じ関数を通すので、3 つの出力が
    // 必ず同じ数になる。旧請求書はヘッダから 1 本合成される。
    taxLines: resolveTaxBuckets(invoice),
  };

  // 科目が一意に決まらない束があるなら、**設定の既定へ黙って落とさずに拒否する**。
  // 落として出すと「違う科目へ計上された仕訳」が出来上がり、会計側で気づくのは
  // ずっと後になる。出さなければ税区分マスタ（MS0F）を直して出し直すだけで済む。
  const conflicts = conflictingTaxRates(input);
  if (conflicts.length > 0) {
    return new Response(
      `Invoice ${id} has tax buckets whose account codes are ambiguous (rates: ${conflicts
        .map((r) => `${Number((r * 100).toFixed(4))}%`)
        .join(
          ", ",
        )}); set the same accounting codes on the tax categories that share each rate`,
      { status: 409 },
    );
  }

  const text = buildAccountingCsvText(input, settings);
  const { bytes, contentType, unmappable } = encodeAccountingCsv(
    text,
    settings.encoding,
  );
  if (unmappable.length > 0) {
    console.warn(
      // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
      `[export/accounting] ${invoice.invoiceNumber}: ${settings.encoding} に変換できない文字を代替しました:`,
      unmappable.join(""),
    );
  }

  // エクスポート日時を刻む（best-effort — 失敗してもダウンロードは返す）。
  //
  // 併せて、その請求書を生んだ締日を EXPORTED へ進める（§9 — 締日の最終状態）。
  // 締日 → 請求書は billing_closings の (invoice_year_month, invoice_seq) が
  // 1 対 1 で持つので、この請求書のエクスポート = その締日の全請求書の
  // エクスポート。請求書の刻印と同じトランザクションで進めて、片方だけ立つ
  // 状態を作らない。
  const exportedAt = new Date();
  let exportedClosingId: string | null = null;
  try {
    exportedClosingId = await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
        data: { accountingExportedAt: exportedAt },
      });
      // PROCESSED のものだけを進める（未処理・二重実行を where で弾く）。
      const closing = await tx.billingClosing.findFirst({
        where: {
          invoiceYearMonth: key.yearMonth,
          invoiceSeq: key.seq,
          status: "PROCESSED",
        },
        select: { id: true },
      });
      if (!closing) return null;
      const updated = await tx.billingClosing.updateMany({
        where: { id: closing.id, status: "PROCESSED" },
        data: { status: "EXPORTED" },
      });
      return updated.count === 1 ? closing.id : null;
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "invoices",
      recordId: invoice.invoiceNumber,
      before: { accountingExportedAt: invoice.accountingExportedAt },
      after: {
        accountingExportedAt: exportedAt.toISOString(),
        // どの設定で出た CSV なのか（設定を変えると同じ請求書でも中身が変わる）。
        settingsRevision: await getAccountingSettingsRevision(),
      },
    });
    if (exportedClosingId) {
      await recordAudit({
        action: "UPDATE",
        tableName: "billing_closings",
        recordId: exportedClosingId,
        before: { status: "PROCESSED" },
        after: { status: "EXPORTED", invoiceNumber: invoice.invoiceNumber },
      });
    }
  } catch (e) {
    console.error(
      "[export/accounting] failed to stamp accountingExportedAt",
      e,
    );
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${invoice.invoiceNumber}_${settings.filenameSuffix}.csv"`,
    },
  });
}
