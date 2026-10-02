import { AccountingDocumentsTable } from "@/components/settings/AccountingDocumentsTable";
import { fetchAccountingDocuments } from "@/lib/accounting-documents";
import { requireAppRead } from "@/lib/authz-page";

export const dynamic = "force-dynamic";

/**
 * 会計文書履歴（SY0J 配下） — 転記・反対仕訳した会計文書の一覧。SAP の
 * FB03（文書表示）に相当する最低限。専用の文書詳細ページは持たず、行は
 * 請求書詳細へ飛ぶ（会計文書履歴パネル・反対仕訳の操作はそちら）。
 *
 * SY0J（会計連携）と同じ権限（`system`）で、専用の操作コードは持たない —
 * `/settings/kiosk-devices/map` / `/settings/trial-pricing-engine/criteria/[id]`
 * と同じ「親アプリのキーでゲートするサブページ」の規約。
 */
export default async function AccountingDocumentsPage() {
  const denied = await requireAppRead("accounting");
  if (denied) return denied;
  const documents = await fetchAccountingDocuments();
  return <AccountingDocumentsTable documents={documents} />;
}
