import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function SalesQuotesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["販売", "見積書", id]} title="見積書 詳細" />
  );
}
