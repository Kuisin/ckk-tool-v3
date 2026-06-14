import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function CustomerBranchNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["マスタ", "顧客", id, "支店", "新規作成"]}
      title="支店 新規作成"
    />
  );
}
