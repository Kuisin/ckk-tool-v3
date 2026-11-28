import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { requireAppRead } from "@/lib/authz-page";
import { fetchOutsourceNumber } from "../data";

export default async function PurchaseOutsourceOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tr = await getTranslations();
  const denied = await requireAppRead("outsource-orders");
  if (denied) return denied;
  const { id } = await params;
  // id は外注工程の uuid。依頼番号（OUT-FFFF-NNNNN）があればそれを見出しに出す
  // — uuid は人が読む識別子ではない。依頼日の無い工程は番号を持たない。
  const number = await fetchOutsourceNumber(decodeURIComponent(id));
  return (
    <PlaceholderPage
      breadcrumbs={[
        tr("common.purchasing"),
        tr("common.outsourceOrder"),
        number ?? id,
      ]}
      title={tr("purchase.outsourceOrders.outsourceOrderDetails")}
    />
  );
}
