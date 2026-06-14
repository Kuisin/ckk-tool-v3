import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function SalesDesignRequestsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["販売", "設計依頼書", id]}
      title="設計依頼書 詳細"
    />
  );
}
