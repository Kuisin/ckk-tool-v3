import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default async function WorkOrderStepExecutionPage({
  params,
}: {
  params: Promise<{ id: string; stepId: string }>;
}) {
  const { id, stepId } = await params;
  return (
    <PlaceholderPage
      breadcrumbs={["生産", "指示書", id, stepId]}
      title="工程実行"
    />
  );
}
