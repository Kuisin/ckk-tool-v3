import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function SalesOrderAcceptancesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["販売", "注文受諾書", id]}
      title="注文受諾書 詳細"
    />
  );
}
