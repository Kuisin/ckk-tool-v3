import { notFound } from "next/navigation";
import { StepExecutionView } from "@/components/production/step-execution/StepExecutionView";
import { fetchStepExecution } from "../../../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; stepId: string }>;
}) {
  const { id } = await params;
  return {
    title: `工程実行 — 指示書 #${decodeURIComponent(id)} | CKK 業務管理システム`,
  };
}

/**
 * 工程実行 (§7 / design.md §12.3)。URL: /production/work-orders/[id]/steps/[stepId]
 * id = 指示書番号（通し連番 int）、stepId = work_order_steps.id (uuid)。
 */
export default async function WorkOrderStepExecutionPage({
  params,
}: {
  params: Promise<{ id: string; stepId: string }>;
}) {
  const { id, stepId } = await params;
  const workOrderNumber = Number(id);
  if (!Number.isInteger(workOrderNumber) || workOrderNumber < 1) notFound();

  const data = await fetchStepExecution(
    workOrderNumber,
    decodeURIComponent(stepId),
  );
  if (!data) notFound();

  return <StepExecutionView data={data} />;
}
