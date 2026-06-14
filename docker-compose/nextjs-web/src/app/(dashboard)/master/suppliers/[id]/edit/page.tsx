import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterSuppliersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["マスタ", "外注企業", id]}
      title="外注企業 編集"
    />
  );
}
