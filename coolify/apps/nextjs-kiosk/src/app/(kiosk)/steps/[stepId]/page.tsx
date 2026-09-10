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
import { resolveBoardLocationByCode } from "@/lib/device-work-location";
import { getSession } from "@/lib/kiosk-auth";
import { boardQuery, parseScope } from "@/lib/location-board-core";
import { getStepRecordingData } from "@/lib/step-records";
import { getMyStep, getStepLocationGate } from "@/lib/steps";

export const dynamic = "force-dynamic";

export default async function StepExecutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ stepId: string }>;
  searchParams: Promise<{ from?: string; loc?: string; scope?: string }>;
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
  const recording = await getStepRecordingData(
    step.stepId,
    session.userId,
    session.locale,
  );
  if (!recording) notFound();

  // 工程マスタの許可作業場所 × この端末（表示用 — 権威は API 側）
  const locationGate = await getStepLocationGate(
    step.stepId,
    session.deviceId,
    session.locale,
  );

  // 来た経路で戻り先を決める。**任意 URL は受けない** — 決め打ちの値のときだけ
  // 固定の遷移先を組み立て、クエリの中身もサーバー側で検証してから使う。
  //   from=wo  → その指示書のビュー
  //   from=loc → 作業場所の一覧（見ていた場所と広さを保つ）
  const { from, loc, scope: rawScope } = await searchParams;
  const backTo =
    from === "wo"
      ? ("workOrder" as const)
      : from === "loc"
        ? ("location" as const)
        : ("list" as const);

  // 一覧から持ち越した作業場所コードは**実在する有効な場所のときだけ**通す。
  // 戻り先の組み立ても開始時の実績もこの値を使うので、生のクエリは信用しない。
  let boardLocationCode: string | null = null;
  if (backTo === "location") {
    const requested = loc?.trim();
    if (requested != null && requested !== "") {
      const resolved = await resolveBoardLocationByCode(
        requested,
        session.locale,
      );
      boardLocationCode = resolved?.code ?? null;
    }
  }
  const backParams =
    backTo === "location"
      ? boardQuery({
          code: boardLocationCode,
          scope: parseScope(rawScope ?? null),
        })
      : "";

  return (
    <I18nProvider locale={session.locale}>
      <StepExecutionView
        backParams={backParams}
        backTo={backTo}
        initialWorkLocationCode={boardLocationCode}
        locationGate={locationGate}
        recording={recording}
        step={step}
      />
    </I18nProvider>
  );
}
