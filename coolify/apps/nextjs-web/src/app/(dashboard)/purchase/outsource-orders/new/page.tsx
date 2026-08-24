import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { requireAppRead } from "@/lib/authz-page";

export default async function PurchaseOutsourceOrdersNewPage() {
  const denied = await requireAppRead("outsource-orders");
  if (denied) return denied;
  return (
    <PlaceholderPage
      breadcrumbs={["購買", "外注依頼", "新規作成"]}
      title="外注依頼 新規作成"
    />
  );
}
