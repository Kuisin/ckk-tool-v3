import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterFactoriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["マスタ", "工場", id]} title="工場 詳細" />
  );
}
