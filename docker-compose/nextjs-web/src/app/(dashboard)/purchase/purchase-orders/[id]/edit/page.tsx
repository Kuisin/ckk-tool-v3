import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function PurchasePurchaseOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["購買", "素材発注書", id]}
      title="素材発注書 編集"
    />
  );
}
