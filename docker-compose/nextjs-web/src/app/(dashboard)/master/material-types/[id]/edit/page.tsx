import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterMaterialTypesEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["マスタ", "材種", id]} title="材種 編集" />
  );
}
