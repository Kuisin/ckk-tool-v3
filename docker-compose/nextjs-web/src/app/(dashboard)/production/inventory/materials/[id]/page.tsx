import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function ProductionInventoryMaterialsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["生産", "素材在庫", id]}
      title="素材在庫 詳細"
    />
  );
}
