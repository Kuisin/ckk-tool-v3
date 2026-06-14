import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function ProductionSalesOrdersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["生産", "受注書", id]} title="受注書 詳細" />
  );
}
