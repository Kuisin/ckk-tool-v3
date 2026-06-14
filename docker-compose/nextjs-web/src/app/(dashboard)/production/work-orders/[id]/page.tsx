import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function ProductionWorkOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["生産", "指示書", id]} title="指示書 詳細" />
  );
}
