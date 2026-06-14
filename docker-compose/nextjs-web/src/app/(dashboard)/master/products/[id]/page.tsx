import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterProductsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["マスタ", "製品", id]} title="製品 詳細" />
  );
}
