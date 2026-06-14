import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterMaterialsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["マスタ", "素材", id]} title="素材 詳細" />
  );
}
