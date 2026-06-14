import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterProcessStepsEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["マスタ", "工程マスタ", id]}
      title="工程マスタ 編集"
    />
  );
}
