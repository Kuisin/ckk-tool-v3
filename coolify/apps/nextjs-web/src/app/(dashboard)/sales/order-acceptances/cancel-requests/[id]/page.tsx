import { notFound, redirect } from "next/navigation";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";

export const dynamic = "force-dynamic";

/**
 * 注文請書キャンセル依頼（承認対象）→ 所属する注文請書へ送るだけのページ。
 *
 * 承認依頼は「依頼」の uuid を指すが、人が見たいのは注文請書（保留中の依頼は
 * その詳細にカードで出る）。承認管理 (PD03) の行から 1 クリックで着けるよう、
 * ここで注文請書番号に読み替えて 302 する。
 */
export default async function AcceptanceCancelRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("order-acceptances");
  if (denied) return denied;
  const { id } = await params;
  const row = await prisma.orderAcceptanceCancelRequest.findUnique({
    where: { id },
    select: { acceptanceYearMonth: true, acceptanceSeq: true },
  });
  if (!row) notFound();
  redirect(
    `/sales/order-acceptances/${formatDocNumber("ORD", {
      yearMonth: row.acceptanceYearMonth,
      seq: row.acceptanceSeq,
    })}`,
  );
}
