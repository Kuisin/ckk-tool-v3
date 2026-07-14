import { notFound, redirect } from "next/navigation";
import { DesignRequestForm } from "@/components/sales/design-requests/DesignRequestForm";
import { isEditable } from "@/components/sales/design-requests/model";
import { fetchDesignRequest } from "../../data";

export const dynamic = "force-dynamic";

/**
 * 設計依頼書 編集 (SA24 → edit)。
 *
 * 編集できるのは「未着手・進行中」のみ — 完了済みは詳細へリダイレクト
 * （サーバーアクション側でも同じガードを行う）。
 * トリガー・参照元（見積書/注文請書）は作成後変更不可。
 */
export default async function SalesDesignRequestsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await fetchDesignRequest(decodeURIComponent(id));
  if (!request) notFound();
  if (!isEditable(request)) redirect(`/sales/design-requests/${request.id}`);

  return <DesignRequestForm mode="edit" request={request} />;
}
