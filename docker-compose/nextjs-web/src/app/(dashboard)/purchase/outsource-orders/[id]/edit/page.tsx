import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function PurchaseOutsourceOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["購買", "外注依頼", id]}
      title="外注依頼 編集"
    />
  );
}
