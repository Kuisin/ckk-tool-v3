import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function SalesOrderAcceptancesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["販売", "注文受諾書", id]}
      title="注文受諾書 編集"
    />
  );
}
