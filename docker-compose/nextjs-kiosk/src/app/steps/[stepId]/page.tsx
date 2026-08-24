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
import { getMyStep, getStepLocationGate } from "@/lib/steps";

export const dynamic = "force-dynamic";

export default async function StepExecutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ stepId: string }>;
  searchParams: Promise<{ from?: string }>;
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

  // 工程マスタの許可作業場所 × この端末（表示用 — 権威は API 側）
  const locationGate = await getStepLocationGate(
    step.stepId,
    session.deviceId,
    session.locale,
  );

  // 指示書スキャン（/wo-scan）から来たときは戻り先をその指示書にする。
  // 任意 URL は受けない — from=wo のときだけ固定の遷移先を組み立てる。
  const { from } = await searchParams;
  const backTo = from === "wo" ? ("workOrder" as const) : ("list" as const);

  return (
    <I18nProvider locale={session.locale}>
      <StepExecutionView
        backTo={backTo}
        locationGate={locationGate}
        recording={recording}
        step={step}
      />
    </I18nProvider>
  );
}
