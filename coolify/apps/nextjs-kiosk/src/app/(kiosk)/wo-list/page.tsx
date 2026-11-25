/**
 * /wo-list — 指示書一覧（承認済み / 進行中。端末の拠点で絞る）。
 *
 * 紙の指示書（QR）が手元に無いときの入口。行を押すと /wo-scan/[woNumber]
 * （指示書スキャンと同じ工程一覧）へ進む。
 *
 * proxy は Cookie の有無しか見ないので、ここでセッションと権限を本検証する。
 */

import { redirect } from "next/navigation";
import { I18nProvider } from "@/components/I18nProvider";
import { WoListView } from "@/components/wo-list/WoListView";
import { readableCodes } from "@/lib/authz";
import { getSession } from "@/lib/kiosk-auth";
import { listActiveWorkOrders } from "@/lib/wo-list";

export const dynamic = "force-dynamic";

export default async function WoListPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const codes = await readableCodes(session.userId);
  if (!codes.has("work_order") && !codes.has("*")) redirect("/");

  const result = await listActiveWorkOrders(session.deviceId, session.locale);

  return (
    <I18nProvider locale={session.locale}>
      <WoListView
        items={result.items}
        plantName={result.plantName}
        truncated={result.truncated}
      />
    </I18nProvider>
  );
}
