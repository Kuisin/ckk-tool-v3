import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterApprovalGroupsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["マスタ", "承認グループ", id]}
      title="承認グループ 詳細"
    />
  );
}
