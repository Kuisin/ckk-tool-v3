import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function MasterCustomersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage breadcrumbs={["マスタ", "顧客", id]} title="顧客 編集" />
  );
}
