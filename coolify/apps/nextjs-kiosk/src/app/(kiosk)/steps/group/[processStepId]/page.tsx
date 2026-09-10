/**
 * /steps/group/[processStepId] — 同じ工程をまとめて記録する画面。
 *
 * 1 台の機械で同じ工程の指示書を何本も回すときの画面。一覧（/steps）から
 * 「まとめて開く」で入る。**まとめる鍵は process_step_id で、工程名ではない** —
 * 名前は多言語 Json を 1 言語に潰した値なので、別のカタログ行が或る言語でだけ
 * 同名になり得る。
 *
 * 割り当てゲートは listMySteps がそのまま持つ（自分の計画 / 自分のロック /
 * 未計画）。ここで絞り込むだけなので、一覧に出ない工程はここにも出ない。
 */

import { notFound, redirect } from "next/navigation";
import { I18nProvider } from "@/components/I18nProvider";
import { StepGroupView } from "@/components/steps/StepGroupView";
import { readableCodes } from "@/lib/authz";
import { getSession } from "@/lib/kiosk-auth";
import { listMySteps } from "@/lib/steps";

export const dynamic = "force-dynamic";

export default async function StepGroupPage({
  params,
}: {
  params: Promise<{ processStepId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const codes = await readableCodes(session.userId);
  if (!codes.has("work_order") && !codes.has("*")) redirect("/");

  const { processStepId } = await params;
  const id = Number(processStepId);
  if (!Number.isSafeInteger(id) || id < 1) notFound();

  const { steps } = await listMySteps(session.userId, session.locale);
  const rows = steps.filter((s) => s.processStepId === id);
  if (rows.length === 0) notFound();

  return (
    <I18nProvider locale={session.locale}>
      <StepGroupView steps={rows} />
    </I18nProvider>
  );
}
