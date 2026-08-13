/**
 * /steps — 工程実行（自分の担当工程の一覧）。
 *
 * proxy は Cookie の有無しか見ないので、ここでセッションと権限を本検証する。
 */

import { redirect } from "next/navigation";
import { I18nProvider } from "@/components/I18nProvider";
import { StepListView } from "@/components/steps/StepListView";
import { readableCodes } from "@/lib/authz";
import { getSession } from "@/lib/kiosk-auth";
import { listMySteps } from "@/lib/steps";

export const dynamic = "force-dynamic";

export default async function StepsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const codes = await readableCodes(session.userId);
  if (!codes.has("work_order") && !codes.has("*")) redirect("/");

  const { steps, upcomingCount, completedSteps, activeStepId } =
    await listMySteps(session.userId, session.locale);

  return (
    <I18nProvider locale={session.locale}>
      <StepListView
        activeStepId={activeStepId}
        completedSteps={completedSteps}
        steps={steps}
        upcomingCount={upcomingCount}
      />
    </I18nProvider>
  );
}
