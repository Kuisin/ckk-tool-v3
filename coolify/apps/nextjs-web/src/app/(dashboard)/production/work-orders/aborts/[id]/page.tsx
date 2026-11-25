import { notFound, redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 指示書の打ち切り申請（承認対象）→ 所属する指示書へ送るだけのページ。
 *
 * 承認依頼は「申請」の uuid を指すが、人が見たいのは指示書（保留中の申請は
 * その詳細にカードで出る）。未処理一覧 (CM01) の行から 1 クリックで着けるよう、
 * ここで指示書番号に読み替えて 302 する（工程フロー変更と同じ）。
 */
export default async function WorkOrderAbortRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("work-orders");
  if (denied) return denied;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const abort = await prisma.workOrderAbort.findUnique({
    where: { id },
    select: { workOrder: { select: { workOrderNumber: true } } },
  });
  if (!abort) notFound();
  redirect(`/production/work-orders/${abort.workOrder.workOrderNumber}`);
}
