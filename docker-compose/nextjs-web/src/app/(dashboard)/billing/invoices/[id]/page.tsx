import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function BillingInvoicesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["請求", "請求書", id]} title="請求書 詳細" />
  );
}
