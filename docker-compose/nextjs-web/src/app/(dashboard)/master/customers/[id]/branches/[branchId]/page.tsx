import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function CustomerBranchDetailPage({
  params,
}: {
  params: Promise<{ id: string; branchId: string }>;
}) {
  const { id, branchId } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["マスタ", "顧客", id, "支店", branchId]}
      title="支店 詳細"
    />
  );
}
