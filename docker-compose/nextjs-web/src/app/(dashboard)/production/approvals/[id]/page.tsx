import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function ProductionApprovalsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["生産", "承認管理", id]}
      title="承認管理 詳細"
    />
  );
}
