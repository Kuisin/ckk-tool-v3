import { getLocale } from "next-intl/server";
import { BpForm } from "@/components/master/business-partners/BpForm";
import { requireAppRead } from "@/lib/authz-page";
import type { Locale } from "@/lib/i18n";
import { listSalesRepCandidates } from "@/lib/sales-rep";
import { loadTaxCategoryOptions } from "@/lib/tax-categories";
import { fetchBillingOptions } from "../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 取引先 新規作成 (MS11). */
export default async function MasterBusinessPartnersNewPage() {
  const denied = await requireAppRead("master-business-partners");
  if (denied) return denied;
  const locale = (await getLocale()) as Locale;
  const [billingOptions, salesRepOptions, taxCategoryOptions] =
    await Promise.all([
      fetchBillingOptions(),
      listSalesRepCandidates(),
      loadTaxCategoryOptions(locale),
    ]);
  return (
    <BpForm
      billingOptions={billingOptions}
      salesRepOptions={salesRepOptions}
      taxCategoryOptions={taxCategoryOptions}
    />
  );
}
