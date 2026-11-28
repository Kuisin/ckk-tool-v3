import { notFound } from "next/navigation";
import { InvoiceDetail } from "@/components/billing/invoices/InvoiceDetail";
import {
  fetchAccountingDocumentHistory,
  fetchActiveAccountingDocument,
} from "@/lib/accounting-documents";
import { appLabelForKey } from "@/lib/app-list";
import { fetchApprovalState, fetchApprovalTrail } from "@/lib/approvals";
import { fetchAuditEntries } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { requireAppRead } from "@/lib/authz-page";
import { loadChargeItemOptions } from "@/lib/charge-items";
import { docNo } from "@/lib/doc-number";
import { docKeyFromParam } from "@/lib/doc-param";
import { listMemos } from "@/lib/document-memos";
import { isIssued, pdfStorageKey, storedPdfMeta } from "@/lib/document-pdf";
import { formatDocPageTitle } from "@/lib/page-title";
import { loadPortalShare } from "@/lib/portal-share";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchInvoice } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getServerLocale();
  return {
    title: formatDocPageTitle(
      appLabelForKey("invoices", "請求書", locale), // i18n-ignore — ja はそのまま使う（訳の実体は appLabelForKey 内の en/zh マップ）
      docNo(decodeURIComponent(id)),
    ),
  };
}

/** 請求書 詳細 (BL21). URL id = 法人コード + 番号（`CKK~INV-2026-00001`）。 */
export default async function BillingInvoicesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("invoices");
  if (denied) return denied;
  const { id } = await params;
  // 番号だけ・旧番号（INV-YYYYMM-NNNNN）の URL は正規の URL へ転送される。
  const key = await docKeyFromParam(
    "invoices",
    "INV",
    id,
    "/billing/invoices",
    "",
    searchParams,
  );

  // 多態参照（監査・メモ・承認）は参照（doc_ref）で引く。
  const number = key.docRef;
  const [invoice, auditEntries, memos] = await Promise.all([
    fetchInvoice(key),
    fetchAuditEntries("invoices", number),
    listMemos("invoices", number),
  ]);
  if (!invoice) notFound();
  // 取引先ポータルの書類リンク（機能・権限・状態が揃ったときだけ出す）。
  const portalShare = await loadPortalShare(
    "invoices",
    key.docRef,
    invoice.status,
  );

  // 保管済み PDF のメタ（発行済みのみ。未生成なら null → 初回表示時に生成）。
  const pdfMeta = isIssued(invoice.status)
    ? await storedPdfMeta(pdfStorageKey.invoice(invoice.invoiceNumber))
    : null;

  // 承認は 2 か所（§9） — DRAFT なら発行前承認、SENT なら入金前承認。
  // どちらでもなければ承認の出番が無い（ISSUED / PAID）。
  const approvalType =
    invoice.status === "DRAFT"
      ? "invoices"
      : invoice.status === "SENT"
        ? "invoice_payments"
        : null;
  const [approval, approvalTrail] = approvalType
    ? await Promise.all([
        fetchApprovalState(approvalType, number),
        fetchApprovalTrail(approvalType, number),
      ])
    : [null, []];

  // 追加費用（§9） — 料金マスタの選択肢と、下書きだけ編集できるの判定。
  const locale = await getServerLocale();
  const [chargeItems, chargeAuthz] = await Promise.all([
    loadChargeItemOptions(locale),
    checkPermission("invoice", "UPDATE"),
  ]);

  // 会計文書（転記・反対仕訳）— いま有効な転記と、その請求書の全履歴。
  const [accountingDocument, accountingHistory] = await Promise.all([
    fetchActiveAccountingDocument(key),
    fetchAccountingDocumentHistory(key),
  ]);

  return (
    <InvoiceDetail
      accountingDocument={accountingDocument}
      accountingHistory={accountingHistory}
      approval={approval}
      approvalTrail={approvalTrail}
      auditEntries={auditEntries}
      canEditCharges={chargeAuthz.ok && invoice.status === "DRAFT"}
      chargeItems={chargeItems}
      invoice={invoice}
      memos={memos}
      pdfMeta={pdfMeta}
      portalShare={portalShare}
    />
  );
}
