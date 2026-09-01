import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { requireAppRead } from "@/lib/authz-page";
import { getTr } from "@/lib/ui-text-server";

export default async function PurchaseOutsourceOrdersNewPage() {
  const tr = await getTr();
  const denied = await requireAppRead("outsource-orders");
  if (denied) return denied;
  return (
    <PlaceholderPage
      breadcrumbs={[tr("購買"), tr("外注依頼"), tr("新規作成")]}
      title={tr("外注依頼 新規作成")}
    />
  );
}
