import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function SalesOrderAcceptancesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["販売", "受注請書", id]}
      title="受注請書 編集"
    />
  );
}
