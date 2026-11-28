import { PriceListTable } from "@/components/sales/price-lists/PriceListTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchCustomerOptions } from "../trial-estimates/data";
import { fetchPriceEntries, fetchPriceListItemOptions } from "./data";

export const dynamic = "force-dynamic";

/** 価格表 一覧 (SA02). */
export default async function PriceListsPage() {
  const denied = await requireAppRead("price-lists");
  if (denied) return denied;
  const [entries, customerOptions, productOptions] = await Promise.all([
    fetchPriceEntries(),
    fetchCustomerOptions(),
    fetchPriceListItemOptions(),
  ]);

  return (
    <PriceListTable
      customerOptions={customerOptions}
      entries={entries}
      productOptions={productOptions}
    />
  );
}
