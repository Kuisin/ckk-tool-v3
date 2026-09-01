import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { requireAppRead } from "@/lib/authz-page";

export default async function PurchaseOutsourceOrdersNewPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("outsource-orders");
  if (denied) return denied;
  return (
    <PlaceholderPage
      breadcrumbs={[
        tr("common.purchasing"),
        tr("common.outsourceOrder"),
        tr("common.new2"),
      ]}
      title={tr("purchase.outsourceOrders.newOutsourceOrder")}
    />
  );
}
