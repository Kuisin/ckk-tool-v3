import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function PurchaseMaterialReceiptsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["購買", "素材入荷", id]}
      title="素材入荷 詳細"
    />
  );
}
