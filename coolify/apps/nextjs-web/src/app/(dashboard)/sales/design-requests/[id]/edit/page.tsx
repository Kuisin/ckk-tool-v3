import { notFound, redirect } from "next/navigation";
import { fetchBillingOptions } from "@/app/(dashboard)/master/_shared/bp-data";
import { DesignRequestForm } from "@/components/sales/design-requests/DesignRequestForm";
import { isEditable } from "@/components/sales/design-requests/model";
import { requireAppRead } from "@/lib/authz-page";
import { docKeyFromParam } from "@/lib/doc-param";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchDesignRequest, fetchEmployeeOptions } from "../../data";

export const dynamic = "force-dynamic";

/**
 * 設計依頼書 編集 (SA26 → edit)。
 *
 * 編集できるのは「下書き・差し戻し」のみ — 承認に出したあとの内容は
 * 承認を受けた中身なので触らせない（サーバーアクション側でも同じガード）。
 * 承認後に変えてよい 担当者 / 製品 は詳細画面の専用アクションで扱う。
 * トリガー・参照元（見積書/注文明細）は作成後変更不可。
 */
export default async function SalesDesignRequestsEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("design-requests");
  if (denied) return denied;
  const { id } = await params;
  const key = await docKeyFromParam(
    "design_requests",
    "DSG",
    id,
    "/sales/design-requests",
    "/edit",
    searchParams,
  );
  const locale = await getServerLocale();
  const [request, assigneeOptions, customerOptions] = await Promise.all([
    fetchDesignRequest(key, locale),
    fetchEmployeeOptions(),
    fetchBillingOptions(),
  ]);
  if (!request) notFound();
  if (!isEditable(request)) {
    redirect(`/sales/design-requests/${request.requestNumber}`);
  }

  return (
    <DesignRequestForm
      assigneeOptions={assigneeOptions}
      customerOptions={customerOptions}
      mode="edit"
      request={request}
    />
  );
}
