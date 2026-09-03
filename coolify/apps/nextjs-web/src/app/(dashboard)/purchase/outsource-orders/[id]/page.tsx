import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { requireAppRead } from "@/lib/authz-page";

export default async function PurchaseOutsourceOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tr = await getTranslations();
  const denied = await requireAppRead("outsource-orders");
  if (denied) return denied;
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={[tr("common.purchasing"), tr("common.outsourceOrder"), id]}
      title={tr("purchase.outsourceOrders.outsourceOrderDetails")}
    />
  );
}
