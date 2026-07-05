import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function ShippingDeliveryNotesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["出荷", "納品書", id]} title="納品書 詳細" />
  );
}
