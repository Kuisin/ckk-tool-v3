import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterEndUsersDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["マスタ", "最終需要家", id]}
      title="最終需要家 詳細"
    />
  );
}
