import { BpTable } from "@/components/master/business-partners/BpTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchBusinessPartners } from "../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 取引先 一覧 (MS01) — 顧客・最終需要家・仕入先/外注先を 1 台帳で扱う。 */
export default async function MasterBusinessPartnersPage() {
  const denied = await requireAppRead("master-business-partners");
  if (denied) return denied;
  const rows = await fetchBusinessPartners();
  return <BpTable rows={rows} />;
}
