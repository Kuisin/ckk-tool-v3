/**
 * /steps/[stepId] — 工程の実行画面（開始・一時停止・再開・完了）。
 *
 * getMyStep が割り当てゲートを兼ねる — 自分の工程でなければ 404
 * （URL 直叩きで他人の工程を開けないようにする）。
 */

import { notFound, redirect } from "next/navigation";
import { I18nProvider } from "@/components/I18nProvider";
import { StepExecutionView } from "@/components/steps/StepExecutionView";
import { readableCodes } from "@/lib/authz";
import { getSession } from "@/lib/kiosk-auth";
import { getStepRecordingData } from "@/lib/step-records";
import { getMyStep } from "@/lib/steps";

export const dynamic = "force-dynamic";

export default async function StepExecutionPage({
  params,
}: {
  params: Promise<{ stepId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const codes = await readableCodes(session.userId);
  if (!codes.has("work_order") && !codes.has("*")) redirect("/");

  const { stepId } = await params;
  const step = await getMyStep(
    session.userId,
    decodeURIComponent(stepId),
    session.locale,
  );
  if (!step) notFound();

  // 検査・不良セクションのデータ（割り当てゲートは getMyStep が通過済み）
  const recording = await getStepRecordingData(step.stepId, session.locale);
  if (!recording) notFound();

  return (
    <I18nProvider locale={session.locale}>
      <StepExecutionView recording={recording} step={step} />
    </I18nProvider>
  );
}
