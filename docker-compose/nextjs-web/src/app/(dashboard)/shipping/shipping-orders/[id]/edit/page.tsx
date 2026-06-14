import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function ShippingShippingOrdersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["出荷", "出荷書", id]} title="出荷書 編集" />
  );
}
