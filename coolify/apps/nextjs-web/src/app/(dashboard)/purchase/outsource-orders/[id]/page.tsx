import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { requireAppRead } from "@/lib/authz-page";
import { getTr } from "@/lib/ui-text-server";

export default async function PurchaseOutsourceOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tr = await getTr();
  const denied = await requireAppRead("outsource-orders");
  if (denied) return denied;
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={[tr("購買"), tr("外注依頼"), id]}
      title={tr("外注依頼 詳細")}
    />
  );
}
