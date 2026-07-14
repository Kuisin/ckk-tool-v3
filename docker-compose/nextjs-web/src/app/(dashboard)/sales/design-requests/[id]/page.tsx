import { notFound } from "next/navigation";
import { DesignRequestDetail } from "@/components/sales/design-requests/DesignRequestDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { fetchDesignRequest } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return {
    title: `設計依頼書 ${decodeURIComponent(id)} | CKK 業務管理システム`,
  };
}

/** 設計依頼書 詳細 (SA24). URL id = 依頼番号 DSG-YYYYMM-NNNNN. */
export default async function SalesDesignRequestsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestNumber = decodeURIComponent(id);

  const [request, auditEntries] = await Promise.all([
    fetchDesignRequest(requestNumber),
    fetchAuditEntries("design_requests", requestNumber),
  ]);
  if (!request) notFound();

  return <DesignRequestDetail auditEntries={auditEntries} request={request} />;
}
