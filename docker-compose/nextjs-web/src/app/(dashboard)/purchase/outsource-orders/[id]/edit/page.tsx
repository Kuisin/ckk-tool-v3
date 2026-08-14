import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { requireAppRead } from "@/lib/authz-page";

export default async function PurchaseOutsourceOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("outsource-orders");
  if (denied) return denied;
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["購買", "外注依頼", id]}
      title="外注依頼 編集"
    />
  );
}
