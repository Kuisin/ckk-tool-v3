import { notFound, redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 工程フロー変更（承認対象）→ 所属する指示書へ送るだけのページ。
 *
 * 承認依頼は「変更」の uuid を指すが、人が見たいのは指示書（保留中の変更は
 * その詳細にカードで出る）。承認管理 (PD03) の行から 1 クリックで着けるよう、
 * ここで指示書番号に読み替えて 302 する。
 */
export default async function FlowChangeRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("work-orders");
  if (denied) return denied;
  const { id } = await params;
  const change = await prisma.workOrderFlowChange.findUnique({
    where: { id },
    select: { workOrder: { select: { workOrderNumber: true } } },
  });
  if (!change) notFound();
  redirect(`/production/work-orders/${change.workOrder.workOrderNumber}`);
}
