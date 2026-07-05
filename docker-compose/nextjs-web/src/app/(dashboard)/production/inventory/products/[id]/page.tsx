import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function ProductionInventoryProductsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["生産", "製品在庫", id]}
      title="製品在庫 詳細"
    />
  );
}
