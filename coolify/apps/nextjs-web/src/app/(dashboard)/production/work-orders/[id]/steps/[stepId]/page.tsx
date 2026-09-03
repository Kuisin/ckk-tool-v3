import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StepExecutionView } from "@/components/production/step-execution/StepExecutionView";
import { appLabelForKey } from "@/lib/app-list";
import { requireAppRead } from "@/lib/authz-page";
import { formatDocPageTitle } from "@/lib/page-title";
import { getServerLocale } from "@/lib/user-preferences";
import { fetchStepExecution, resolveWorkOrderIdParam } from "../../../data";

export const dynamic = "force-dynamic";

/** 未認証スクレイパ向けの汎用 OG（種別+番号のみ、業務データなし）。 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; stepId: string }>;
}) {
  const { id } = await params;
  const [locale, tr] = await Promise.all([
    getServerLocale(),
    getTranslations(),
  ]);
  return {
    title: formatDocPageTitle(
      `${tr("settings.kioskSettings.stepExecution")} — ${appLabelForKey("work-orders", "指示書", locale)}`,
      `#${decodeURIComponent(id)}`,
    ),
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
  const denied = await requireAppRead("work-orders");
  if (denied) return denied;
  const { id, stepId } = await params;
  const workOrderNumber = await resolveWorkOrderIdParam(id);
  if (workOrderNumber == null) notFound();

  const data = await fetchStepExecution(
    workOrderNumber,
    decodeURIComponent(stepId),
  );
  if (!data) notFound();

  return <StepExecutionView data={data} />;
}
