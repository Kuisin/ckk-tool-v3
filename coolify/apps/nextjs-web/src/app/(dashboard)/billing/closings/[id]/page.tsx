import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ClosingDetail } from "@/components/billing/closings/ClosingDetail";
import { fetchAuditEntries } from "@/lib/audit";
import { requireAppRead } from "@/lib/authz-page";
import { fetchClosing } from "../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別のみ、業務データなし）。 */
export async function generateMetadata() {
  const tr = await getTranslations();
  return {
    title: tr("billing.closings.billingClosingDetailsCkkBusinessManagement"),
  };
}

/** 締日処理 詳細 (BL22). URL id = billing_closings.id (uuid). */
export default async function BillingClosingsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("billing-closings");
  if (denied) return denied;
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
