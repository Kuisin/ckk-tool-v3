import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function BillingClosingsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["請求", "締日処理", id]}
      title="締日処理 詳細"
    />
  );
}
