import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterInspectionTemplatesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["マスタ", "検査表テンプレート", id]}
      title="検査表テンプレート 詳細"
    />
  );
}
