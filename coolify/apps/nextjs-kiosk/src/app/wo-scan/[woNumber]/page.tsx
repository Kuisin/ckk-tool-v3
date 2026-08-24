/**
 * /wo-scan/[woNumber] — スキャンした指示書の工程一覧。
 *
 * 全工程を工程順で出し、行レベルゲート（自分の計画 / 未計画）を通る工程だけ
 * 実行画面（/steps/[stepId]?from=wo）へ進める。存在しない番号は 404 では
 * なく「見つかりません」画面（スキャンへ戻る導線付き）にする — 現場の
 * 共有端末で行き止まりを作らないため。
 */

import { redirect } from "next/navigation";
import { I18nProvider } from "@/components/I18nProvider";
import { WoStepsView } from "@/components/wo-scan/WoStepsView";
import { readableCodes } from "@/lib/authz";
import { getSession } from "@/lib/kiosk-auth";
import { getWorkOrderOverview } from "@/lib/steps";
import { parseWorkOrderNumber } from "@/lib/wo-scan-core";

export const dynamic = "force-dynamic";

export default async function WoStepsPage({
  params,
}: {
  params: Promise<{ woNumber: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const codes = await readableCodes(session.userId);
  if (!codes.has("work_order") && !codes.has("*")) redirect("/");

  const { woNumber } = await params;
  const parsed = parseWorkOrderNumber(decodeURIComponent(woNumber));
  if (parsed == null) redirect("/wo-scan");

  const overview = await getWorkOrderOverview(
    parsed,
    session.userId,
    session.locale,
  );

  return (
    <I18nProvider locale={session.locale}>
      <WoStepsView overview={overview} workOrderNumber={parsed} />
    </I18nProvider>
  );
}
