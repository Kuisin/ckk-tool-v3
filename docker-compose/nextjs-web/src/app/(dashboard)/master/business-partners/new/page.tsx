import { BpForm } from "@/components/master/business-partners/BpForm";
import { requireAppRead } from "@/lib/authz-page";
import { listSalesRepCandidates } from "@/lib/sales-rep";
import { fetchBillingOptions } from "../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 取引先 新規作成 (MS11). */
export default async function MasterBusinessPartnersNewPage() {
  const denied = await requireAppRead("master-business-partners");
  if (denied) return denied;
  const [billingOptions, salesRepOptions] = await Promise.all([
    fetchBillingOptions(),
    listSalesRepCandidates(),
  ]);
  return (
    <BpForm billingOptions={billingOptions} salesRepOptions={salesRepOptions} />
  );
}
