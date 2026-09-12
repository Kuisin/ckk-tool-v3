import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { BpForm } from "@/components/master/business-partners/BpForm";
import { requireAppRead } from "@/lib/authz-page";
import type { Locale } from "@/lib/i18n";
import { listSalesRepCandidates } from "@/lib/sales-rep";
import { loadTaxCategoryOptions } from "@/lib/tax-categories";
import { fetchBillingOptions, fetchBpDetail } from "../../../_shared/bp-data";

export const dynamic = "force-dynamic";

/** 取引先 編集 (MS21). */
export default async function MasterBusinessPartnersEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const denied = await requireAppRead("master-business-partners");
  if (denied) return denied;
  const { id } = await params;
  const locale = (await getLocale()) as Locale;
  const [record, billingOptions, salesRepOptions, taxCategoryOptions] =
    await Promise.all([
      fetchBpDetail(id),
      fetchBillingOptions(id),
      listSalesRepCandidates(),
      loadTaxCategoryOptions(locale),
    ]);
  if (!record) notFound();
  return (
    <BpForm
      billingOptions={billingOptions}
      initial={record}
      salesRepOptions={salesRepOptions}
      taxCategoryOptions={taxCategoryOptions}
    />
  );
}
