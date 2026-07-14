import { notFound } from "next/navigation";
import { ClosingDetail } from "@/components/billing/closings/ClosingDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { fetchClosing } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別のみ、業務データなし）。 */
export async function generateMetadata() {
  return { title: "締日処理 詳細 | CKK 業務管理システム" };
}

/** 締日処理 詳細 (BL22). URL id = billing_closings.id (uuid). */
export default async function BillingClosingsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const closingId = decodeURIComponent(id);
  // uuid 以外は Prisma に渡す前に 404（不正入力での 500 を避ける）。
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      closingId,
    )
  ) {
    notFound();
  }

  const [closing, auditEntries] = await Promise.all([
    fetchClosing(closingId),
    fetchAuditEntries("billing_closings", closingId),
  ]);
  if (!closing) notFound();

  return <ClosingDetail auditEntries={auditEntries} closing={closing} />;
}
