/**
 * /wo-scan — 指示書スキャン（QR を読んで指示書の工程一覧へ）。
 *
 * proxy は Cookie の有無しか見ないので、ここでセッションと権限を本検証する。
 */

import { redirect } from "next/navigation";
import { I18nProvider } from "@/components/I18nProvider";
import { WoScanView } from "@/components/wo-scan/WoScanView";
import { readableCodes } from "@/lib/authz";
import { getSession } from "@/lib/kiosk-auth";

export const dynamic = "force-dynamic";

export default async function WoScanPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const codes = await readableCodes(session.userId);
  if (!codes.has("work_order") && !codes.has("*")) redirect("/");

  return (
    <I18nProvider locale={session.locale}>
      <WoScanView />
    </I18nProvider>
  );
}
